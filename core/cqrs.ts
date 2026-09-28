type Awaitable<T> = T | Promise<T> | PromiseLike<T>;

type CqrsRequest<TPayload = unknown> = {
   _type: string;
   requestName: string;
   payload: TPayload;
};

export type Query<TPayload> = CqrsRequest<TPayload> & { _type: "query" };

export type Command<TPayload = unknown> = CqrsRequest<TPayload> & {
   _type: "command";
};

export type Result<TResult = void> =
   | { success: true; data: TResult }
   | { success: false; error: string };

export function createHandler<TInput, TOutput = void>(
   type: string,
   handler: (payload: TInput) => Awaitable<Result<TOutput>>,
) {
   return {
      type,
      execute: async (payload: TInput): Promise<Result<TOutput>> => {
         try {
            const result = await handler(payload);
            return result;
         } catch (err: any) {
            return {
               success: false,
               error: err.message || `Handler "${type}" failed`,
            };
         }
      },
   };
}

export type Handler<I, O> = {
   type: string;
   execute: (payload: I) => Promise<Result<O>>;
};

type AnyHandler = Handler<unknown, unknown>;

export type MediatorObserver = (
   request: { _type: string; requestName: string },
   outcome: { durationMs: number; ok: boolean },
) => void;

let _observer: MediatorObserver | undefined;

/** Install the single process-wide request timing observer; pass nothing to remove it. */
export function setMediatorObserver(observer?: MediatorObserver): void {
   _observer = observer;
}

class Mediator {
   private commandHandlers = new Map<string, AnyHandler>();
   private queryHandlers = new Map<string, AnyHandler>();

   registerCommand<I, O>(handler: Handler<I, O>): void {
      this.commandHandlers.set(handler.type, handler as AnyHandler);
   }

   registerQuery<I, O>(handler: Handler<I, O>): void {
      this.queryHandlers.set(handler.type, handler as AnyHandler);
   }

   /** Main method - recommended */
   async send<T = unknown>(request: CqrsRequest): Promise<T> {
      const isCommand = this.commandHandlers.has(request.requestName);
      const handler = isCommand
         ? this.commandHandlers.get(request.requestName)
         : this.queryHandlers.get(request.requestName);

      if (!handler) {
         throw new Error(
            `No handler registered for type: ${request.requestName}`,
         );
      }

      const startedAt = performance.now();
      let ok = false;
      try {
         const result = await handler.execute(request.payload);

         if (!result.success) {
            throw new Error(result.error);
         }

         ok = true;
         return result.data as T;
      } finally {
         try {
            _observer?.(request, { durationMs: performance.now() - startedAt, ok });
         } catch {
            // Instrumentation must never change request outcomes.
         }
      }
   }

   async execute<T = unknown>(request: CqrsRequest): Promise<T> {
      return this.send<T>(request);
   }
}

let _mediator: Mediator | undefined;
export function mountVendor() {
   if (_mediator) return;
   const mediator = new Mediator();
   _mediator = mediator;
}

export function useMediator() {
   if (!_mediator) throw new Error("Mediator not mounted");
   return _mediator;
}
