import { createContext, useContext, useEffect, useReducer, useRef, useState } from "react";
import CheckboxField from "./CheckboxField";
import useElapsedSeconds from "./useElapsedSeconds";

type FormState = { message: string; submitCount: number; isError: boolean };

const MessageContext = createContext<FormState>({ message: "", submitCount: 0, isError: false });
type FormAction = { type: "error"; message: string } | { type: "success" };

function reducer(state: FormState, action: FormAction): FormState {
    switch (action.type) {
        case "error":
            return { message: action.message, submitCount: state.submitCount, isError: true };
        case "success":
            {
                const newSubmitCount = state.submitCount + 1;
                return { message: "送信しました", submitCount: newSubmitCount, isError: false };
            }
    }
}

function Test() {

    const [name, setName] = useState("");
    const [isCheck, setIsCheck] = useState(false);
    const [shouldThrow, setShouldThrow] = useState(false); // Error Boundaryの確認用
    const [formState, dispatch] = useReducer(reducer, { message: "", submitCount: 0, isError: false });

    useEffect(() => {
        console.log(`名前が${name.length}文字になりました`);
    }, [name]);

    const nameInputRef = useRef<HTMLInputElement>(null);
    const elapsedSeconds = useElapsedSeconds();

    const handleSend = (e: React.SubmitEvent<HTMLFormElement>) => {
        e.preventDefault();

        if (!name) {
            dispatch({ type: "error", message: "名前を入力してください" });
            return;
        } else if (!isCheck) {
            dispatch({ type: "error", message: "利用規約に同意のチェックが入っていません" });
            return;
        }

        dispatch({ type: "success" });
        nameInputRef.current?.focus()
    }

    // レンダリング中にエラーを投げる(Error Boundaryが受け止められるのはこの種類のエラー)
    if (shouldThrow) {
        throw new Error("Error Boundaryの動作確認用のエラーです");
    }

    return (
        <div className="p-6 max-w-md text-left">
            <h2 className="text-xl font-bold mb-4">フォームの練習(第9〜15章)</h2>
            <form onSubmit={handleSend} className="flex flex-col gap-3 bg-white border border-gray-200 rounded-lg p-4">
                <label className="flex flex-col gap-1 text-sm">
                    名前
                    <input
                        ref={nameInputRef}
                        type="text"
                        name="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="名前を入力"
                        className="border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                </label>
                <CheckboxField name="agree" checked={isCheck} onChange={setIsCheck} label="利用規約に同意する" />
                <button
                    type="submit"
                    className="self-start bg-blue-500 text-white px-4 py-2 rounded-md font-medium hover:bg-blue-600"
                >
                    送信
                </button>
                <MessageContext.Provider value={formState}>
                    <Wrapper />
                </MessageContext.Provider>
                <p className="text-xs text-gray-500">経過時間: {elapsedSeconds}秒</p>
                <button
                    type="button"
                    onClick={() => setShouldThrow(true)}
                    className="self-start border border-red-300 text-red-600 px-3 py-1.5 rounded-md text-sm hover:bg-red-50"
                >
                    エラーを発生させる(Error Boundaryの確認用)
                </button>
            </form>
        </div>
    );
}
export default Test;

// 中間コンポーネント:Propsを何も受け取らない
function Wrapper() {
    return <MessageDisplay />;
}

// 実際にmessageを表示するコンポーネント
function MessageDisplay() {
    const { message, isError } = useContext(MessageContext);
    if (!message) return null;

    // エラーは赤、成功は緑で表示する。
    // role="alert" はスクリーンリーダーにエラーをすぐ読み上げさせるための指定
    return (
        <p
            role={isError ? "alert" : "status"}
            className={`text-sm ${isError ? "text-red-600" : "text-green-600"}`}
        >
            {message}
        </p>
    );
}
