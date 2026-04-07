export function Nav({ displayName }: { displayName: string }) {
  return (
    <nav class="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
      <a href="/" class="text-xl font-bold text-indigo-600">
        Graphein
      </a>
      <div class="flex items-center gap-4">
        <span class="text-sm text-gray-600">{displayName}</span>
        <a
          href="/auth/logout"
          class="text-sm text-gray-500 hover:text-gray-700"
        >
          ログアウト
        </a>
      </div>
    </nav>
  );
}
