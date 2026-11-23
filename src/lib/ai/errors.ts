export class AIError extends Error {
  constructor(
    message: string,
    public code: string,
    public status = 500,
  ) {
    super(message);
    this.name = "AIError";
  }
}
