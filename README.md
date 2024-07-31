# An RxJS Component Store for React

When I was an Angular developer, I enjoyed using [@ngrx/component-store]([NgRx - @ngrx/component-store](https://ngrx.io/guide/component-store)) for my component's state management. But when my work circumstances changed, and I became a React developer, I missed the power and declarative approach I got from using RxJS. So I thought I would make a library that provides the bare-minimum functionality of @ngrx/component-store as a React hook.

I'm a big fan of RxJS, and I've always felt it was a perfect fit for React development. The react hook allows you to define a component store similar to how it is done using @ngrx/component-store, and not have to mess with subscribing and subscribing to the observables.



## Install

```
npm i use-component-store
```



## Usage



You'll need to define an interface for your application's state, and then a store that gives you the ability to set up observables that change the state. For example:



App.store.ts:

```ts
export interface AppState {
    mouseMovePosition: {
        x: number;
        y: number;
    };

    mouseClickPosition: {
        x: number;
        y: number;
    };
}

export class AppStore extends ComponentStore<AppState> {
    constructor() {
        super({
            mouseClickPosition: { x: 0, y: 0 },
            mouseMovePosition: { x: 0, y: 0, }
        });
    }

    updateMouseClickPosition = this.effect<MouseEvent>(origin$ =>
        origin$.pipe(
            tap((event) => {
                this.setState((state) => ({
                    ...state,
                    mouseClickPosition: {
                        x: event.clientX,
                        y: event.clientY,
                    }
                }));
            })
        )
    );

    updateMouseMovePosition = this.effect<MouseEvent>(origin$ =>
        origin$.pipe(
            tap((event) => {
                this.setState((state) => ({
                    ...state,
                    mouseMovePosition: {
                        x: event.clientX,
                        y: event.clientY,
                    }
                }));
            })
        )
    );
}
```



From your React component, you can call `useComponentStore` to get a handle to the current state and the store. You can also pass an initialization function, which will be called the first time the store is created. For example:



App.tsx

```tsx
...
import { useComponentStore } from './utils/component-store.ts';
import { AppState, AppStore } from './App.store.ts';

export function App() {
    const [state, store] = useComponentStore<AppState, AppStore>(AppStore, () => {
        // This demonstrates sending updates to the store one at a time:
        window.addEventListener('mousedown', (event: MouseEvent) => store.updateMouseClickPosition(event));

        // This demonstrates sending updates to the store using an observable:
        store.updateMouseMovePosition(fromEvent<MouseEvent>(window, 'mousemove'));
    });

    return (
        <>
            <div>
                Mouse move position: {state.mouseMovePosition.x}, {state.mouseMovePosition.y}
            </div>
            <div>
                Mouse click position: {state.mouseClickPosition.x}, {state.mouseClickPosition.y}
            </div>
        </>
    )
}
```

