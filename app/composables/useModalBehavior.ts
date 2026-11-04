import { isRef, nextTick, onBeforeUnmount, watch, type Ref } from "vue";

/*
 * Shared modal behaviour: traps Tab focus inside the container while open,
 * closes on Escape, moves focus into the dialog when it opens, and returns
 * focus to the element that opened it when it closes.
 *
 * Call once from a dialog component's setup:
 *   const container = useTemplateRef<HTMLElement>("dialog");
 *   useModalBehavior({ isOpen: () => props.open, onClose: () => emit("close"), container });
 * isOpen, container and initialFocus accept refs, getters, or plain values.
 * The keydown listener is only attached while the modal is open and is
 * removed on close and on unmount.
 *
 * When several modals are open at once, only the most recently opened
 * (topmost) one reacts to Escape/Tab, so one Escape closes one dialog.
 */
export type ModalValueSource<T> = Ref<T> | (() => T) | T;

export interface UseModalBehaviorOptions {
    isOpen: ModalValueSource<boolean>;
    onClose: () => void;
    container: ModalValueSource<HTMLElement | null | undefined>;
    initialFocus?: ModalValueSource<HTMLElement | null | undefined>;
}

const focusableSelector = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

/* Open modals in open order; the last entry is the topmost dialog. */
const openModalStack: object[] = [];

function readValue<T>(source: ModalValueSource<T>): T {
    if (typeof source === "function") return (source as () => T)();
    if (isRef(source)) return source.value;
    return source as T;
}

export function useModalBehavior(options: UseModalBehaviorOptions) {
    let opener: HTMLElement | null = null;
    let listening = false;
    const stackEntry = {};
    const joinStack = () => { if (!openModalStack.includes(stackEntry)) openModalStack.push(stackEntry); };
    const leaveStack = () => { const index = openModalStack.indexOf(stackEntry); if (index >= 0) openModalStack.splice(index, 1); };
    const isTopmost = () => openModalStack[openModalStack.length - 1] === stackEntry;

    const isOpenNow = () => Boolean(readValue(options.isOpen));
    const containerElement = () => readValue(options.container) ?? null;

    const focusableElements = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>(focusableSelector)]
        .filter(element => element.getClientRects().length > 0);

    const focusInitial = async () => {
        await nextTick();
        if (!isOpenNow()) return;
        const container = containerElement();
        if (!container) return;
        const preferred = options.initialFocus ? readValue(options.initialFocus) : null;
        const target = preferred ?? focusableElements(container)[0] ?? container;
        target.focus();
    };

    const restoreFocus = () => {
        const target = opener;
        opener = null;
        if (target?.isConnected) target.focus();
    };

    const handleKeydown = (event: KeyboardEvent) => {
        if (!isOpenNow()) return;
        if (event.defaultPrevented) return;
        if (!isTopmost()) return;
        if (event.key === "Escape") {
            event.preventDefault();
            options.onClose();
            return;
        }
        if (event.key !== "Tab") return;
        const container = containerElement();
        if (!container) return;
        const elements = focusableElements(container);
        if (!elements.length) {
            event.preventDefault();
            container.focus();
            return;
        }
        const first = elements[0]!;
        const last = elements[elements.length - 1]!;
        if (event.shiftKey && (document.activeElement === first || !container.contains(document.activeElement))) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !container.contains(document.activeElement))) {
            event.preventDefault();
            first.focus();
        }
    };

    const startListening = () => {
        if (listening || typeof window === "undefined") return;
        window.addEventListener("keydown", handleKeydown);
        listening = true;
    };

    const stopListening = () => {
        if (!listening || typeof window === "undefined") return;
        window.removeEventListener("keydown", handleKeydown);
        listening = false;
    };

    const stopWatching = watch(() => isOpenNow(), (open) => {
        if (typeof document === "undefined") return;
        if (open) {
            joinStack();
            if (!opener && document.activeElement instanceof HTMLElement) opener = document.activeElement;
            startListening();
            void focusInitial();
        } else {
            leaveStack();
            stopListening();
            restoreFocus();
        }
    }, { immediate: true });

    onBeforeUnmount(() => {
        stopWatching();
        stopListening();
        leaveStack();
    });

    return { handleKeydown };
}
