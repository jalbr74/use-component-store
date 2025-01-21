import { BehaviorSubject, isObservable, Observable, Subject, Subscription, tap } from 'rxjs';
import { Dispatch, SetStateAction, useEffect, useMemo, useState } from 'react';

/**
 * Provides a React hook for working with the component's state and component store.
 *
 * <pre>
 *     const [state, store] = useComponentStore<AppState, AppStore>(AppStore, () => {
 *         store.init();
 *     });
 * </pre>
 */
export function useComponentStore<StateType, StoreType extends ComponentStore<StateType>>(
    ComponentStoreConstructor: new (initialState?: StateType) => StoreType,
    initializeFn?: () => void
): [StateType, StoreType] {
    const store = useMemo<StoreType>(() => new ComponentStoreConstructor(), [ComponentStoreConstructor]);
    const [state, setState] = useState<StateType>(store.state);

    store.reactSetState = setState;

    useEffect(() => {
        store.createSubscriptions();

        initializeFn?.();

        return () => store.removeSubscriptions();
    }, [store]);

    return [state, store];
}

interface ObservableHandler {
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
    private observableHandlers: ObservableHandler[] = [];
    private isSubscribed = false;

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

    /**
     * You can call this the same way you could call React's setState function. For example:
     *
     * this.setState((prevState: MyState): MyState => ({
     *     ...prevState,
     *     myValue: 'Hello World'
     * }));
     */
    setState(stateUpdaterFn: ((prevState: T) => T)): void {
        this.reactSetState?.((state: T) => {
            const newState = stateUpdaterFn(state);
            this.stateSubject.next(newState);

            return newState;
        });
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
        this.addObservable(generator(origin$));

        return ((observableOrValue?: ObservableType | Observable<ObservableType>): void => {
            if (isObservable(observableOrValue)) {
                this.addObservable(observableOrValue.pipe(
                    tap((value: ObservableType) => {
                        origin$.next(value as ObservableType);
                    })
                ));
            } else {
                origin$.next(observableOrValue as ObservableType);
            }
        });
    }

    addObservable(observable: Observable<unknown>): void {
        const observableHandler: ObservableHandler = {
            observable
        };

        if (this.isSubscribed) {
            // console.log('Creating an out-of-band subscription for observable: %O', observableHandler.observable);
            observableHandler.subscription = observable.subscribe();
        }

        this.observableHandlers.push(observableHandler);
    }

    /**
     * Provides a way to activate the effects defined by this component store. This is handled automatically by
     * useComponentStore().
     */
    createSubscriptions(): void {
        this.observableHandlers.forEach((observableHandler, index) => {
            // console.log('Subscribing observable: %O, at index: %O', observableHandler.observable, index);
            observableHandler.subscription = observableHandler.observable.subscribe();
        });

        this.isSubscribed = true;
    }

    /**
     * Provides a way to deactivate the effects defined by this component store. This is handled automatically by
     * useComponentStore().
     */
    removeSubscriptions(): void {
        this.observableHandlers.forEach((observableHandler, index) => {
            // console.log('Unsubscribing from observable: %O, at index: %O', observableHandler.observable, index);
            observableHandler.subscription?.unsubscribe();
        });

        this.isSubscribed = false;
    }
}
