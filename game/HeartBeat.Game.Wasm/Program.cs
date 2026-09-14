// The browser-wasm SDK requires an entry point for an OutputType=Exe project.
// It never runs anything: the worker starts the runtime and calls the
// [JSExport] methods in Bridge.cs directly. Keeping Main empty is the point -
// there is no startup order for the worker to get wrong.
return;
