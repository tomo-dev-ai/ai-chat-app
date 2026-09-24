import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

// ==================================================
// ダミーAPI(実際のサーバーの代わりに、遅延だけ再現した関数)
// ==================================================
type User = { id: number; name: string };

let dummyUsers: User[] = [
  { id: 1, name: "田中" },
  { id: 2, name: "鈴木" },
];
let fetchCount = 0;

function fetchUsersDummy(): Promise<User[]> {
  fetchCount++;
  return new Promise((resolve) => {
    setTimeout(() => resolve([...dummyUsers]), 800); // 通信っぽく0.8秒待つ
  });
}

function addUserDummy(name: string): Promise<User> {
  return new Promise((resolve) => {
    setTimeout(() => {
      const newUser = { id: Date.now(), name };
      dummyUsers = [...dummyUsers, newUser];
      resolve(newUser);
    }, 800);
  });
}

// ==================================================
// カスタムフックに抽出(第15章の考え方の再利用)
// ==================================================
function useUsers() {
  return useQuery({
    queryKey: ["users"],
    queryFn: fetchUsersDummy,
    staleTime: 5000, // 5秒間はfreshとみなす
  });
}

function useAddUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (name: string) => addUserDummy(name),

    // 楽観的更新: サーバーの返事を待たず、先にキャッシュへ仮追加する
    onMutate: async (name: string) => {
      await queryClient.cancelQueries({ queryKey: ["users"] });
      const previousUsers = queryClient.getQueryData<User[]>(["users"]);

      queryClient.setQueryData<User[]>(["users"], (old = []) => [
        ...old,
        { id: Date.now(), name: `${name}(送信中...)` },
      ]);

      return { previousUsers };
    },

    // 失敗したら、仮追加する前の状態にロールバック
    onError: (_err, _name, context) => {
      if (context?.previousUsers) {
        queryClient.setQueryData(["users"], context.previousUsers);
      }
    },

    // 成功・失敗どちらでも、最終的にサーバー(ダミー)の本当のデータで同期し直す
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

// ==================================================
// 表示部分
// ==================================================
function UserList() {
  const { data: users, isLoading, error, refetch } = useUsers();
  const addUser = useAddUser();
  const [name, setName] = useState("");

  const [searchParams, setSearchParams] = useSearchParams();
  const sort = searchParams.get("sort") || "asc";

  const sortedUsers = useMemo(() => users
    ? [...users].sort((a, b) => {
      return sort === "asc"
        ? a.name.localeCompare(b.name)
        : b.name.localeCompare(a.name);
    })
    : users, [users, sort]);

  if (isLoading) return <p>読み込み中...</p>;
  if (error) return <p>エラーが発生しました</p>;

  return (
    <div className="border border-gray-300 rounded-lg p-4 mb-4 bg-white">
      <div className="flex gap-2 mb-3">
        <button
          onClick={() => setSearchParams({ sort: "asc" })}
          className={`px-3 py-1 rounded-md text-sm ${sort === "asc"
            ? "bg-blue-100 text-blue-700 font-bold"
            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
        >
          昇順
        </button>
        <button
          onClick={() => setSearchParams({ sort: "desc" })}
          className={`px-3 py-1 rounded-md text-sm ${sort === "desc"
            ? "bg-blue-100 text-blue-700 font-bold"
            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
        >
          降順
        </button>
      </div>
      <ul className="mb-3 space-y-1">
        {sortedUsers?.map((u) => (
          <li key={u.id} className="px-2 py-1 bg-gray-50 rounded">
            {u.name}
          </li>
        ))}
      </ul>

      <div className="flex gap-2 mb-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="名前を入力"
          className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <button
          onClick={() => {
            if (!name.trim()) return;
            addUser.mutate(name);
            setName("");
          }}
          className="bg-blue-500 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-600"
        >
          追加(楽観的更新)
        </button>
      </div>

      <button
        onClick={() => refetch()}
        className="border border-gray-300 text-gray-700 px-3 py-1.5 rounded-md text-sm hover:bg-gray-100"
      >
        このコンポーネントで再取得(staleTimeに関係なく強制的に取得します)
      </button>

      <p className="text-gray-500 text-xs mt-2">
        fetchUsersDummy 実行回数: {fetchCount}
      </p>
    </div>
  );
}

function TanStackQueryDemo() {
  const [showList, setShowList] = useState(true);

  return (
    <div className="p-5 font-sans max-w-xl">
      <h2 className="text-xl font-bold mb-3">TanStack Query 動作確認</h2>

      <button
        onClick={() => setShowList((v) => !v)}
        className="bg-gray-700 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-800 mb-3"
      >
        {showList ? "コンポーネントを非表示にする" : "コンポーネントを再表示する(マウントし直す)"}
      </button>

      <p className="text-gray-500 text-xs mb-4">
        非表示→再表示を5秒(staleTime)以内に繰り返すと、fetchUsersDummyの実行回数は
        増えません(キャッシュがfreshなので取得しに行かない)。5秒以上待ってから
        再表示すると、キャッシュは即座に画面に出しつつ、裏で自動的に再取得が走り、
        実行回数が増えるのが確認できます(stale-while-revalidate)。
      </p>

      {showList && <UserList />}
    </div>
  );
}

// ==================================================
// QueryClientの準備(アプリ全体で1つだけ作る)
// ==================================================
const queryClient = new QueryClient();

function TanStackQueryTest() {
  return (
    <QueryClientProvider client={queryClient}>
      <TanStackQueryDemo />
    </QueryClientProvider>
  );
}

export default TanStackQueryTest;
