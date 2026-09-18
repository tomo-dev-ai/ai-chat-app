import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

type Props = {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    message: string;
};

function ConfirmModal({ isOpen, onClose, onConfirm, message }: Props) {
    const cancelButtonRef = useRef<HTMLButtonElement>(null);
    const modalRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isOpen) return; // モーダルが閉じている間は何もしない

        cancelButtonRef.current?.focus();

    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                onClose();
                return;
            }

            if (e.key === "Tab" && modalRef.current) {
                // モーダル内のフォーカス可能な要素をすべて取得
                const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
                    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
                );
                const first = focusableElements[0];
                const last = focusableElements[focusableElements.length - 1];

                if (e.shiftKey && document.activeElement === first) {
                    // 最初の要素でShift+Tab → 最後の要素へ
                    e.preventDefault();
                    last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                    // 最後の要素でTab → 最初の要素へ
                    e.preventDefault();
                    first.focus();
                }
            }
        };

        window.addEventListener("keydown", handleKeyDown);

        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return createPortal(
        <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center"
            onClick={onClose}
        >
            <div
                ref={modalRef}
                role="dialog"
                aria-modal="true"
                className="bg-white rounded-lg p-6 shadow-lg max-w-sm"
                onClick={(e) => e.stopPropagation()}
            >
                <p className="mb-4">{message}</p>
                <div className="flex gap-2 justify-end">
                    <button ref={cancelButtonRef} onClick={onClose} className="px-3 py-1.5 rounded-md border border-gray-300 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400">
                        キャンセル
                    </button>
                    <button onClick={onConfirm} className="px-3 py-1.5 rounded-md bg-red-500 text-white hover:bg-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2">
                        削除する
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}

export default ConfirmModal;