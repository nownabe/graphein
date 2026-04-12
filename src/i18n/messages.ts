export type Locale = "ja" | "en";

const messages: Record<Locale, Record<string, string>> = {
  ja: {
    // Nav
    "nav.logout": "ログアウト",
    "nav.admin": "管理",

    // Admin
    "admin.members.title": "メンバー管理",
    "admin.members.description":
      "管理者は所有者かどうかにかかわらず、すべてのタスク操作を実行できます。",
    "admin.role.admin": "管理者",
    "admin.role.user": "ユーザー",
    "admin.button.promote": "管理者に昇格",
    "admin.button.demote": "管理者から外す",
    "admin.confirm.demote": "このメンバーを管理者から外しますか？",
    "admin.cannotRemoveLastAdmin": "管理者は少なくとも1人必要です",
    "admin.you": "あなた",

    // Page titles
    "page.myTasks": "マイタスク",
    "page.ownedTasks": "オーナーのタスク",
    "page.archived": "アーカイブ済みタスク",
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
    "button.unarchive": "戻す",
    "button.save": "保存",
    "button.cancel": "キャンセル",

    // Button titles (tooltips)
    "button.done.title": "完了にする",
    "button.reopen.title": "未完了に戻す",
    "button.edit.title": "編集",
    "button.status.title": "完了状態を確認",
    "button.archive.title": "アーカイブ",
    "button.unarchive.title": "アーカイブから戻す",

    // Form labels
    "form.title": "タイトル",
    "form.description": "説明",
    "form.deadline": "期限",

    // Task card
    "task.deadline": "期限",

    // Task status page
    "taskStatus.progress": "進捗",
    "taskProgress.done": "完了",

    // Links
    "link.archived": "アーカイブ済み",
    "link.backToMyTasks": "マイタスクに戻る",
    "link.backToOwnedTasks": "オーナータスクに戻る",

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

    // View tabs
    "view.assigned": "担当",
    "view.owned": "オーナー",
    "empty.owned": "オーナーになっているタスクはありません",

    // Confirm dialogs
    "confirm.archive": "このタスクをアーカイブしますか？",
    "confirm.removeOwner": "このオーナーを除外しますか？",

    // Owners
    "owners.title": "オーナー",
    "owners.slackUserIdPlaceholder": "Slack ユーザー ID",
    "owners.searchPlaceholder": "名前またはメールで検索",
    "owners.searchNoResults": "該当するメンバーが見つかりません",
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
    "summary.owned": "件",

    // Slack modal & messages
    "slack.modal.title": "タスク作成",
    "slack.modal.submit": "作成",
    "slack.modal.cancel": "キャンセル",
    "slack.modal.close": "閉じる",
    "slack.modal.loading": "タスクを準備中です...",
    "slack.modal.titleLabel": "タイトル",
    "slack.modal.deadlineLabel": "期限",
    "slack.modal.originalMessage": "元のメッセージ:",
    "slack.modal.error": "タスクの作成中にエラーが発生しました。もう一度お試しください。",
    "slack.reply.assigned": "タスク *{taskLink}* を {who} に割り当てました",
    "slack.reply.fallbackAssignee": "担当者",
  },
  en: {
    // Nav
    "nav.logout": "Logout",
    "nav.admin": "Admin",

    // Admin
    "admin.members.title": "Member Management",
    "admin.members.description":
      "Admins can perform all task owner actions on any task, regardless of ownership.",
    "admin.role.admin": "Admin",
    "admin.role.user": "User",
    "admin.button.promote": "Promote to admin",
    "admin.button.demote": "Remove admin",
    "admin.confirm.demote": "Remove admin role from this member?",
    "admin.cannotRemoveLastAdmin": "At least one admin must remain",
    "admin.you": "you",

    // Page titles
    "page.myTasks": "My Tasks",
    "page.ownedTasks": "Owned Tasks",
    "page.archived": "Archived Tasks",
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
    "button.unarchive": "Unarchive",
    "button.save": "Save",
    "button.cancel": "Cancel",

    // Button titles (tooltips)
    "button.done.title": "Mark as done",
    "button.reopen.title": "Reopen task",
    "button.edit.title": "Edit",
    "button.status.title": "View completion status",
    "button.archive.title": "Archive",
    "button.unarchive.title": "Restore from archive",

    // Form labels
    "form.title": "Title",
    "form.description": "Description",
    "form.deadline": "Deadline",

    // Task card
    "task.deadline": "Deadline",

    // Task status page
    "taskStatus.progress": "Progress",
    "taskProgress.done": " done",

    // Links
    "link.archived": "Archived",
    "link.backToMyTasks": "Back to My Tasks",
    "link.backToOwnedTasks": "Back to Owned Tasks",

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

    // View tabs
    "view.assigned": "Assigned",
    "view.owned": "Owned",
    "empty.owned": "No tasks owned",

    // Confirm dialogs
    "confirm.archive": "Are you sure you want to archive this task?",
    "confirm.removeOwner": "Are you sure you want to remove this owner?",

    // Owners
    "owners.title": "Owners",
    "owners.slackUserIdPlaceholder": "Slack User ID",
    "owners.searchPlaceholder": "Search by name or email",
    "owners.searchNoResults": "No matching members",
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
    "summary.owned": "total",

    // Slack modal & messages
    "slack.modal.title": "Create Task",
    "slack.modal.submit": "Create",
    "slack.modal.cancel": "Cancel",
    "slack.modal.close": "Close",
    "slack.modal.loading": "Preparing task...",
    "slack.modal.titleLabel": "Title",
    "slack.modal.deadlineLabel": "Deadline",
    "slack.modal.originalMessage": "Original message:",
    "slack.modal.error": "An error occurred while creating the task. Please try again.",
    "slack.reply.assigned": "Assigned task *{taskLink}* to {who}",
    "slack.reply.fallbackAssignee": "the assignee",
  },
};

export default messages;
