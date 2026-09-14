// Required by the browser-wasm SDK as the bundle's entry point. It is
// deliberately inert: the real host is `app/src/features/eve-garden/engine/
// game.worker.ts`, which imports `dotnet.js` from this bundle itself and drives
// the exports in Bridge.cs. Nothing should be added here - code in this file
// runs outside the worker's control and cannot be tested.
export {};
