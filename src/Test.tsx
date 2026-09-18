import { createContext, useContext, useEffect, useReducer, useRef, useState } from "react";
import CheckboxField from "./CheckboxField";
import useElapsedSeconds from "./useElapsedSeconds";

const MessageContext = createContext<string>("");

type FormState = { message: string; submitCount: number };
type FormAction = { type: "error"; message: string } | { type: "success" };

function reducer(state: FormState, action: FormAction): FormState {
    switch (action.type) {
        case "error":
            return { message: action.message, submitCount: state.submitCount };
        case "success":
            const newSubmitCount = state.submitCount + 1;
            return { message: "送信しました", submitCount: newSubmitCount };
    }
}

function Test() {

    const [name, setName] = useState("");
    const [isCheck, setIsCheck] = useState(false);
    const [formState, dispatch] = useReducer(reducer, { message: "", submitCount: 0 });

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

    return (
        <div>
            <form onSubmit={handleSend}>
                <input
                    ref={nameInputRef}
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                />
                <br></br>
                <CheckboxField checked={isCheck} onChange={setIsCheck} label="利用規約に同意する" />
                <br></br>
                <button type="submit">送信</button>
                <MessageContext.Provider value={formState.message}>
                    <Wrapper />
                </MessageContext.Provider>
                <p>経過時間: {elapsedSeconds}秒</p>
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
    const message = useContext(MessageContext);
    return <p>{message}</p>;
}
