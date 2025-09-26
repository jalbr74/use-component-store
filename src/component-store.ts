import { BehaviorSubject, isObservable, Observable, Subject, Subscription, takeUntil, tap } from 'rxjs';
import { Dispatch, SetStateAction, useEffect, useState } from 'react';

type AnyStore = ComponentStore<any>;
type StateOf<S extends AnyStore> = S extends ComponentStore<infer T> ? T : never;
type NoArgStoreCtor<S extends AnyStore = AnyStore> = new () => S;

function isNoArgCtor(x: unknown): x is NoArgStoreCtor {
    return (
        typeof x === "function" &&
        !!(x as any).prototype &&
        ("setUpSubscriptions" in (x as any).prototype || "tearDownSubscriptions" in (x as any).prototype)
    );
}

/**
 * Provides a React hook for working with the component's state and component store.
 *
 * <pre>
 *     const [state, store] = useComponentStore(AppStore);
 * </pre>
 */
export function useComponentStore<Ctor extends NoArgStoreCtor>(
    storeConstructor: Ctor
): [StateOf<InstanceType<Ctor>>, InstanceType<Ctor>];

/**
 * Similar to useComponentStore, but instead of passing in a constructor, you pass in a factory function that creates
 * the store. This is useful when your store's constructor requires parameters.
 *
 * <pre>
 *     const [state, store] = useComponentStore(() => new AppStore('Initial Message'));
 * </pre>
 */
export function useComponentStore<ComponentStoreInstance extends AnyStore>(
    storeFactory: () => ComponentStoreInstance
): [StateOf<ComponentStoreInstance>, ComponentStoreInstance];

/* ——— single implementation ——— */
export function useComponentStore(
    arg: NoArgStoreCtor | (() => AnyStore)
) {
    const [store] = useState<AnyStore>(() => isNoArgCtor(arg) ? new arg() : (arg as () => AnyStore)());
    const [state, setState] = useState(store.state);

    store.reactSetState = setState;

    useEffect(() => {
        store.setUpSubscriptions();
        store.init();

        return () => store.tearDownSubscriptions();
    }, [store]);

    return [state, store];
}

interface ObservableHandler {
    index: number;
    observable: Observable<unknown>;
    subscription?: Subscription;
}

/**
 * Provides a way to create RxJS effects, which are handy when a component wants to communicate with the outside world.
 * A component must define a state (such as: MyComponentState) and a store (such as MyComponentStore), which is a
 * subclass of this class:
 */
export class ComponentStore<T> {
    private stateSubject: BehaviorSubject<T>;
    private isSubscribed = false;
    private observableIndex = 0;
    private readonly destroyed$ = new Subject<void>();

    private persistentObservableHandlers: ObservableHandler[] = [];
    private transientObservableHandlers: ObservableHandler[] = [];

    state$: Observable<T>;
    reactSetState?: Dispatch<SetStateAction<T>>;

    get state(): T {
        return this.stateSubject.value;
    }

    /**
     * Saves off the setter returned from a call to the React hook: useState.
     */
    constructor(initialState: T) {
        this.stateSubject = new BehaviorSubject(initialState);
        this.state$ = this.stateSubject.asObservable();
    }

    init(): void {
    }

    /**
     * You can call this the same way you could call React's setState function. For example:
     *
     * this.setState((prevState: MyState): MyState => ({
     *     ...prevState,
     *     myValue: 'Hello World'
     * }));
     */
    setState(stateUpdaterFn: (prevState: T) => T): void {
        if (this.reactSetState) {
            this.reactSetState((state: T) => {
                const newState = stateUpdaterFn(state);
                this.stateSubject.next(newState);

                return newState;
            });
        } else {
            const newState = stateUpdaterFn(this.state);
            this.stateSubject.next(newState);
        }
    }

    /**
     * Provides an easy way to update the state when you don't need to use the values from the old state. For example:
     *
     * this.patchState({
     *     myValue: 'Hello World'
     * });
     */
    patchState(changes: Partial<T>) {
        this.setState((state) => ({
            ...state,
            ...changes
        }));
    }

    /**
     * Provides a way for subclasses to define RxJS effects, which automatically get subscribed and unsubscribed during
     * the lifecycle of the component store. You can define an effect as follows:
     *
     * <pre>
     *     retrieveMessage = this.effect<string>((origin$) => origin$
     *         .pipe(
     *             switchMap((id: string) => fromPromise(
     *                 fetch(`/api/message/${id}`)
     *             ).pipe(
     *                 switchMap((response: Response) => response.json()),
     *
     *                 // This is where you can handle the response, and update the state
     *                 tap({
     *                     next: (message: string) => {
     *                         this.setState((state: AppState) => ({
     *                             ...state,
     *                             message
     *                         }));
     *                     },
     *
     *                     error: (e) => console.error(e),
     *                 }),
     *
     *                 // This ensures that the effect doesn't stop if an error occurs
     *                 catchError((error) => EMPTY)
     *             ))
     *         )
     *     );
     * </pre>
     */
    effect<ObservableType>(generator: (source$: Observable<ObservableType>) => Observable<unknown>) {
        const origin$ = new Subject<ObservableType>();
        this.addObservable(generator(origin$), true);

        return ((observableOrValue?: ObservableType | Observable<ObservableType>): void => {
            if (isObservable(observableOrValue)) {
                this.addObservable(observableOrValue.pipe(
                    tap((value: ObservableType) => {
                        // console.log(`Emitting value to effect`);
                        origin$.next(value as ObservableType);
                    })
                ), false);
            } else {
                origin$.next(observableOrValue as ObservableType);
            }
        });
    }

    private addObservable(observable: Observable<unknown>, isPersistent: boolean): void {
        // Create an observable handler, which will hold the subscription when created
        const observableHandler: ObservableHandler = {
            index: this.observableIndex++,
            observable
        };

        // console.log(`Adding observable with ID: ${observableHandler.index}, isPersistent: ${isPersistent}`);

        if (this.isSubscribed) {
            // console.log(`Doing an out-of-band subscription for observable with ID: ${observableHandler.index}`);
            observableHandler.subscription = observable.subscribe();
        }

        if (isPersistent) this.persistentObservableHandlers.push(observableHandler);
        else this.transientObservableHandlers.push(observableHandler);
    }

    /**
     * Provides a way to activate the effects defined by this component store. This is handled automatically by
     * useComponentStore().
     */
    setUpSubscriptions(): void {
        if (this.isSubscribed) return;

        this.persistentObservableHandlers.forEach((observableHandler) => {
            // console.log(`Subscribing persistent observable with ID: ${observableHandler.index}`);
            observableHandler.subscription = observableHandler.observable.subscribe();
        });

        this.transientObservableHandlers.forEach((observableHandler) => {
            // console.log(`Subscribing transient observable with ID: ${observableHandler.index}`);
            observableHandler.subscription = observableHandler.observable
                .pipe(takeUntil(this.destroyed$))
                .subscribe();
        });

        this.isSubscribed = true;
    }

    /**
     * Provides a way to deactivate the effects defined by this component store. This is handled automatically by
     * useComponentStore().
     */
    tearDownSubscriptions(): void {
        if (!this.isSubscribed) return;

        // Signal all transient to complete
        this.destroyed$.next();

        this.persistentObservableHandlers.forEach((observableHandler) => {
            // console.log(`Unsubscribing persistent observable with ID: ${observableHandler.index}`);
            observableHandler.subscription?.unsubscribe();
            observableHandler.subscription = undefined;
        });

        this.transientObservableHandlers.forEach((observableHandler) => {
            // console.log(`Unsubscribing transient observable with ID: ${observableHandler.index}`);
            observableHandler.subscription?.unsubscribe();
            observableHandler.subscription = undefined;
        });

        // Note: Transient observables get recreated automatically when the component is remounted.
        this.transientObservableHandlers = [];

        this.isSubscribed = false;
    }
}
