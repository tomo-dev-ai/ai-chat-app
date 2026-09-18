import { useEffect, useState } from "react";

function useElapsedSeconds(): number {

    const [elapsedSeconds, setElapsedSeconds] = useState(0);

    useEffect(() => {
        const timer = setInterval(() => {
            setElapsedSeconds(prev => prev + 1);
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    return elapsedSeconds;
}

export default useElapsedSeconds;