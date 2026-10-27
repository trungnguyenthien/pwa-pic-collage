export class HistoryManager {
  private undoStack: ImageData[] = [];
  private redoStack: ImageData[] = [];
  private maxHistory: number = 10;
  private onChangeCallbacks: ((canUndo: boolean, canRedo: boolean) => void)[] = [];

  constructor(maxHistory: number = 10) {
    this.maxHistory = maxHistory;
  }

  public pushState(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    try {
      const snapshot = ctx.getImageData(0, 0, width, height);
      this.undoStack.push(snapshot);
      if (this.undoStack.length > this.maxHistory) {
        this.undoStack.shift(); // Evict oldest snapshot to prevent memory bloat
      }
      this.redoStack = []; // Clear redo stack on new action
      this.notify();
    } catch (e) {
      console.warn('Could not save history snapshot:', e);
    }
  }

  public undo(currentCtx: CanvasRenderingContext2D, canvas: HTMLCanvasElement): boolean {
    if (this.undoStack.length <= 1) return false;

    // Pop current state and move to redo
    const currentState = this.undoStack.pop();
    if (currentState) {
      this.redoStack.push(currentState);
    }

    // Restore previous state
    const prevState = this.undoStack[this.undoStack.length - 1];
    if (prevState) {
      canvas.width = prevState.width;
      canvas.height = prevState.height;
      currentCtx.putImageData(prevState, 0, 0);
      this.notify();
      return true;
    }
    return false;
  }

  public redo(currentCtx: CanvasRenderingContext2D, canvas: HTMLCanvasElement): boolean {
    if (this.redoStack.length === 0) return false;

    const nextState = this.redoStack.pop();
    if (nextState) {
      this.undoStack.push(nextState);
      canvas.width = nextState.width;
      canvas.height = nextState.height;
      currentCtx.putImageData(nextState, 0, 0);
      this.notify();
      return true;
    }
    return false;
  }

  public clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.notify();
  }

  public canUndo(): boolean {
    return this.undoStack.length > 1;
  }

  public canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  public onChange(callback: (canUndo: boolean, canRedo: boolean) => void): void {
    this.onChangeCallbacks.push(callback);
    callback(this.canUndo(), this.canRedo());
  }

  private notify(): void {
    const canUndo = this.canUndo();
    const canRedo = this.canRedo();
    this.onChangeCallbacks.forEach(cb => cb(canUndo, canRedo));
  }
}
