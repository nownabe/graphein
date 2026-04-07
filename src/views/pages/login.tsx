import { Layout } from "../layout";

export function LoginPage() {
  return (
    <Layout title="ログイン">
      <div class="flex items-center justify-center min-h-screen">
        <div class="bg-white rounded-lg shadow-md p-8 max-w-sm w-full text-center">
          <h1 class="text-2xl font-bold text-gray-900 mb-2">Graphein</h1>
          <p class="text-gray-500 mb-6">
            Slack のポストをタスクに変換
          </p>
          <a
            href="/auth/slack"
            hx-boost="false"
            class="inline-flex items-center gap-2 bg-[#4A154B] text-white px-6 py-3 rounded-md font-medium hover:bg-[#3a1039] transition-colors"
          >
            Slack でログイン
          </a>
        </div>
      </div>
    </Layout>
  );
}
