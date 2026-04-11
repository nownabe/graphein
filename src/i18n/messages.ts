export type Locale = "ja" | "en";

const messages: Record<Locale, Record<string, string>> = {
  ja: {
    // Nav
    "nav.logout": "ログアウト",

    // Page titles
    "page.myTasks": "マイタスク",
    "page.archived": "アーカイブ済み",
    "page.editTask": "タスクを編集",
    "page.taskStatus": "完了状態",
    "page.login": "ログイン",

    // Status labels
    "status.open": "未完了",
    "status.done": "完了",
    "status.archived": "アーカイブ済み",

    // Button labels
    "button.done": "完了",
    "button.reopen": "戻す",
    "button.edit": "編集",
    "button.status": "状態",
    "button.archive": "アーカイブ",
    "button.save": "保存",
    "button.cancel": "キャンセル",

    // Button titles (tooltips)
    "button.done.title": "完了にする",
    "button.reopen.title": "未完了に戻す",
    "button.edit.title": "編集",
    "button.status.title": "完了状態を確認",
    "button.archive.title": "アーカイブ",

    // Form labels
    "form.title": "タイトル",
    "form.description": "説明",
    "form.deadline": "期限",

    // Task card
    "task.deadline": "期限",

    // Task status page
    "taskStatus.progress": "進捗",

    // Links
    "link.archived": "アーカイブ済み →",
    "link.backToMyTasks": "← マイタスク",
    "link.backToMyTasksFromEdit": "← マイタスクに戻る",

    // Empty states
    "empty.tasks":
      "タスクはまだありません。\nSlack のメンションからタスクが自動で作成されます。",
    "empty.archived": "アーカイブ済みのタスクはありません",
    "empty.default": "タスクはありません",

    // Login page
    "login.title": "Graphein",
    "login.description": "ἐκ λόγων εἰς ἔργα",
    "login.slack": "Slack でログイン",

    // Filter tabs
    "filter.all": "すべて",
    "filter.open": "未完了",
    "filter.done": "完了",

    // Confirm dialogs
    "confirm.archive": "このタスクをアーカイブしますか？",
    "confirm.removeOwner": "このオーナーを除外しますか？",

    // Owners
    "owners.title": "オーナー",
    "owners.slackUserIdPlaceholder": "Slack ユーザー ID",
    "button.addOwner": "追加",
    "button.remove": "除外",

    // Language switcher
    "lang.switch": "EN",

    // Task card
    "task.overdue": "期限切れ",

    // Temporal sections
    "section.overdue": "期限切れ",
    "section.today": "今日",
    "section.thisWeek": "今週",
    "section.later": "それ以降",
    "section.noDueDate": "期限なし",

    // Summary
    "summary.open": "件が未完了",
    "summary.overdue": "件が期限切れ",
  },
  en: {
    // Nav
    "nav.logout": "Logout",

    // Page titles
    "page.myTasks": "My Tasks",
    "page.archived": "Archived",
    "page.editTask": "Edit Task",
    "page.taskStatus": "Completion Status",
    "page.login": "Login",

    // Status labels
    "status.open": "Open",
    "status.done": "Done",
    "status.archived": "Archived",

    // Button labels
    "button.done": "Done",
    "button.reopen": "Reopen",
    "button.edit": "Edit",
    "button.status": "Status",
    "button.archive": "Archive",
    "button.save": "Save",
    "button.cancel": "Cancel",

    // Button titles (tooltips)
    "button.done.title": "Mark as done",
    "button.reopen.title": "Reopen task",
    "button.edit.title": "Edit",
    "button.status.title": "View completion status",
    "button.archive.title": "Archive",

    // Form labels
    "form.title": "Title",
    "form.description": "Description",
    "form.deadline": "Deadline",

    // Task card
    "task.deadline": "Deadline",

    // Task status page
    "taskStatus.progress": "Progress",

    // Links
    "link.archived": "Archived →",
    "link.backToMyTasks": "← My Tasks",
    "link.backToMyTasksFromEdit": "← Back to My Tasks",

    // Empty states
    "empty.tasks":
      "No tasks yet.\nTasks are created automatically from Slack mentions.",
    "empty.archived": "No archived tasks",
    "empty.default": "No tasks",

    // Login page
    "login.title": "Graphein",
    "login.description": "ἐκ λόγων εἰς ἔργα",
    "login.slack": "Sign in with Slack",

    // Filter tabs
    "filter.all": "All",
    "filter.open": "Open",
    "filter.done": "Done",

    // Confirm dialogs
    "confirm.archive": "Are you sure you want to archive this task?",
    "confirm.removeOwner": "Are you sure you want to remove this owner?",

    // Owners
    "owners.title": "Owners",
    "owners.slackUserIdPlaceholder": "Slack User ID",
    "button.addOwner": "Add",
    "button.remove": "Remove",

    // Language switcher
    "lang.switch": "日本語",

    // Task card
    "task.overdue": "overdue",

    // Temporal sections
    "section.overdue": "Overdue",
    "section.today": "Today",
    "section.thisWeek": "This Week",
    "section.later": "Later",
    "section.noDueDate": "No Due Date",

    // Summary
    "summary.open": "open",
    "summary.overdue": "overdue",
  },
};

export default messages;
