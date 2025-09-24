# An RxJS Component Store for React

When I was an Angular developer, I enjoyed using [@ngrx/component-store](https://ngrx.io/guide/component-store) for my component's state management. But when my work circumstances changed, and I became a React developer, I missed the power and declarative approach I got from using RxJS. So I thought I would make a library that provides the bare-minimum functionality of @ngrx/component-store as a React hook.

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

    message: string;
}

export class AppStore extends ComponentStore<AppState> {
    constructor(initialMessage: string) {
        super({
            mouseClickPosition: { x: 0, y: 0 },
            mouseMovePosition: { x: 0, y: 0, },
            message: initialMessage,
        });
    }

    init() {
        // This demonstrates sending updates to the store one at a time:
        window.addEventListener('mousedown', (event: MouseEvent) => this.updateMouseClickPosition(event));

        // This demonstrates sending updates to the store using an observable:
        this.updateMouseMovePosition(fromEvent<MouseEvent>(window, 'mousemove'));
    }

    updateMouseClickPosition = this.effect<MouseEvent>(
        origin$ => origin$
            .pipe(
                tap((event) => {
                    this.patchState({
                        mouseClickPosition: {
                            x: event.clientX,
                            y: event.clientY,
                        }
                    });
                })
            )
    );

    updateMouseMovePosition = this.effect<MouseEvent>(
        origin$ => origin$
            .pipe(
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

    changeMessage(message: string) {
        this.patchState({
            message
        })
    }
}
```



From your React component, you can call `useComponentStore` to get a handle to the current state and the store. You can also pass an array of args, which will be passed to the component store when it is constructed. For example:



App.tsx

```tsx
...
import { useComponentStore } from './utils/component-store.ts';
import { AppState, AppStore } from './App.store.ts';

export function App() {
    const [state, store] = useComponentStore(AppStore, ['Initial message']);

    return (
        <>
            <div>
                Mouse move position: {state.mouseMovePosition.x}, {state.mouseMovePosition.y}
            </div>
            <div>
                Mouse click position: {state.mouseClickPosition.x}, {state.mouseClickPosition.y}
            </div>
            <div>
                Message: {state.message}
            </div>
            <div>
                <button onClick={() => store.changeMessage('Hello World!')}>Set Message</button>
            </div>
        </>
    )
}
```
