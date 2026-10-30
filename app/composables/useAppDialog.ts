export interface ConfirmDialogOptions {
    title: string;
    message?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    destructive?: boolean;
}

export interface PromptDialogOptions extends ConfirmDialogOptions {
    inputLabel: string;
    initialValue?: string;
    validate?: (value: string) => string | undefined;
}

export interface DialogRequest {
    id: string;
    kind: "confirm" | "prompt";
    title: string;
    message?: string;
    confirmLabel: string;
    cancelLabel: string;
    destructive: boolean;
    inputLabel?: string;
    initialValue?: string;
}

const validators = new Map<string, (value: string) => string | undefined>();
const resolvers = new Map<string, (value: boolean | string | undefined) => void>();
const queueKey = "ruxt-app-dialog-queue";

export function validateAppDialogInput(id: string, value: string): string | undefined {
    return validators.get(id)?.(value);
}

export function resolveAppDialog(id: string, value: boolean | string | undefined): void {
    const resolve = resolvers.get(id);
    if (!resolve) return;
    resolvers.delete(id);
    validators.delete(id);
    resolve(value);
}

export function useAppDialog() {
    const queue = useState<DialogRequest[]>(queueKey, () => []);

    const enqueue = <T extends boolean | string | undefined>(
        kind: DialogRequest["kind"],
        options: ConfirmDialogOptions | PromptDialogOptions,
    ) => new Promise<T>((resolve) => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const request: DialogRequest = {
            id,
            kind,
            title: options.title,
            message: options.message,
            confirmLabel: options.confirmLabel ?? (kind === "prompt" ? "Save" : "Confirm"),
            cancelLabel: options.cancelLabel ?? "Cancel",
            destructive: options.destructive ?? false,
            ...(kind === "prompt" ? {
                inputLabel: (options as PromptDialogOptions).inputLabel,
                initialValue: (options as PromptDialogOptions).initialValue ?? "",
            } : {}),
        };
        resolvers.set(id, value => resolve(value as T));
        if (kind === "prompt" && (options as PromptDialogOptions).validate) {
            validators.set(id, (options as PromptDialogOptions).validate!);
        }
        queue.value = [...queue.value, request];
    });

    return {
        confirm: (options: ConfirmDialogOptions) => enqueue<boolean>("confirm", options),
        prompt: (options: PromptDialogOptions) => enqueue<string | undefined>("prompt", options),
    };
}

export function useAppDialogQueue() {
    return useState<DialogRequest[]>(queueKey, () => []);
}
