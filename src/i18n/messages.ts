export type Locale = "ja" | "en";

const messages: Record<Locale, Record<string, string>> = {
  ja: {
    // Nav
    "nav.logout": "ログアウト",
    "nav.admin": "管理",
    "nav.tasks": "タスク",

    // Admin
    "admin.users.title": "ユーザー管理",
    "admin.users.description":
      "管理者は所有者かどうかにかかわらず、すべてのタスク操作を実行できます。",
    "admin.role.admin": "管理者",
    "admin.role.user": "ユーザー",
    "admin.button.promote": "管理者に昇格",
    "admin.button.demote": "管理者から外す",
    "admin.confirm.demote": "このユーザーを管理者から外しますか？",
    "admin.cannotRemoveLastAdmin": "管理者は少なくとも1人必要です",
    "admin.button.deactivate": "無効化",
    "admin.button.reactivate": "有効化",
    "admin.confirm.deactivate":
      "このユーザーを無効化しますか？無効化されたユーザーはタスクの割り当て対象や日報の処理対象から除外されます。",
    "admin.status.deactivated": "無効",
    "admin.you": "あなた",
    "admin.users.search": "名前またはメールで検索…",
    "admin.users.noResults": "該当するユーザーが見つかりません",
    "admin.users.prev": "前へ",
    "admin.users.next": "次へ",
    "admin.users.pageInfo": "{page} / {totalPages}",
    "admin.tab.users": "ユーザー",
    "admin.tab.snippetChannels": "日報チャンネル",

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
    "empty.tasks": "タスクはまだありません。\nSlack のメンションからタスクが自動で作成されます。",
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
    "owners.searchNoResults": "該当するユーザーが見つかりません",
    "button.addOwner": "追加",
    "button.remove": "除外",

    // Language switcher
    "lang.switch": "English",

    // Theme
    "nav.theme.light": "ライトモード",
    "nav.theme.dark": "ダークモード",

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
    "slack.modal.assigneesLabel": "アサインするユーザー",
    "slack.modal.groupsLabel": "アサインするグループ",
    "slack.modal.originalMessage": "元のメッセージ:",
    "slack.modal.duplicate": "このメッセージからすでにタスクが作成されています: *{taskLink}*",
    "slack.modal.duplicateSubmit": "作成する",
    "slack.modal.error": "タスクの作成中にエラーが発生しました。もう一度お試しください。",
    "slack.reply.assigned": "タスク *{taskLink}* を {who} に割り当てました",
    "slack.reply.fallbackAssignee": "担当者",

    // Snippets
    "nav.snippets": "日報",
    "page.snippets": "日報",
    "snippets.period.day": "日",
    "snippets.period.week": "週",
    "snippets.period.month": "月",
    "snippets.period.quarter": "四半期",
    "snippets.period.year": "年",
    "snippets.filter.postedBy": "投稿者",
    "snippets.filter.mentions": "メンション",
    "snippets.filter.mentionedUser": "メンションされたユーザー",
    "snippets.filter.mentionedUsergroup": "メンションされたグループ",
    "snippets.filter.all": "すべて",
    "snippets.filter.searchPoster": "投稿者を検索…",
    "snippets.empty": "この期間に日報はありません",
    "snippets.filter.sectionSelected": "選択中",
    "snippets.filter.sectionUsers": "ユーザー",
    "snippets.filter.sectionGroups": "グループ",
    "snippets.filter.searchUser": "ユーザーを検索…",
    "snippets.filter.searchUsergroup": "グループを検索…",
    "snippets.count.one": "件の日報",
    "snippets.count.other": "件の日報",
    "snippets.filter.noResults": "該当なし",
    "snippets.filter.ok": "OK",
    "snippets.filter.clear": "クリア",
    "snippets.filter.clearAll": "フィルターをリセット",
    "snippets.prev": "前へ",
    "snippets.next": "次へ",

    // Slack snippet shortcut
    "slack.snippet.title": "日報を追加",
    "slack.snippet.submit": "追加",
    "slack.snippet.cancel": "キャンセル",
    "slack.snippet.close": "閉じる",
    "slack.snippet.loading": "処理中です...",
    "slack.snippet.originalMessage": "メッセージ:",
    "slack.snippet.success": "日報を追加しました。",
    "slack.snippet.duplicate": "このメッセージはすでに日報として登録されています。",
    "slack.snippet.error": "日報の追加中にエラーが発生しました。もう一度お試しください。",
    "slack.snippet.noMentions":
      "このメッセージにはメンションが含まれていないため、日報として追加できません。",

    // Slack kudos shortcut
    "slack.kudos.title": "Kudosを追加",
    "slack.kudos.submit": "追加",
    "slack.kudos.cancel": "キャンセル",
    "slack.kudos.close": "閉じる",
    "slack.kudos.loading": "処理中です...",
    "slack.kudos.originalMessage": "メッセージ:",
    "slack.kudos.success": "Kudosを追加しました。",
    "slack.kudos.duplicate": "このメッセージはすでにKudosとして登録されています。",
    "slack.kudos.error": "Kudosの追加中にエラーが発生しました。もう一度お試しください。",
    "slack.kudos.noEntries":
      "このメッセージにはKudosのエントリが含まれていません。メンションで始まる行が必要です。",

    // Admin snippet channels
    "admin.snippetChannels.title": "日報チャンネル管理",
    "admin.snippetChannels.description": "日報を自動取得するSlackチャンネルを設定します。",
    "admin.snippetChannels.add": "チャンネルを追加",
    "admin.snippetChannels.placeholder": "Slack チャンネル ID",
    "admin.snippetChannels.remove": "削除",
    "admin.snippetChannels.empty": "チャンネルが設定されていません",
    "admin.snippetChannels.confirmRemove": "このチャンネルを削除しますか？",

    // Admin kudos channels
    "admin.tab.kudosChannels": "Kudosチャンネル",
    "admin.kudosChannels.title": "Kudosチャンネル管理",
    "admin.kudosChannels.description": "Kudosを自動取得するSlackチャンネルを設定します。",
    "admin.kudosChannels.add": "チャンネルを追加",
    "admin.kudosChannels.placeholder": "Slack チャンネル ID",
    "admin.kudosChannels.remove": "削除",
    "admin.kudosChannels.empty": "チャンネルが設定されていません",
    "admin.kudosChannels.confirmRemove": "このチャンネルを削除しますか？",

    // Kudos
    "nav.kudos": "Kudos",
    "page.kudos": "Kudos",
    "kudos.period.day": "日",
    "kudos.period.week": "週",
    "kudos.period.month": "月",
    "kudos.period.quarter": "四半期",
    "kudos.period.year": "年",
    "kudos.filter.postedBy": "投稿者",
    "kudos.filter.mentionedUser": "宛先",
    "kudos.filter.all": "すべて",
    "kudos.filter.searchPoster": "投稿者を検索…",
    "kudos.filter.searchUser": "ユーザーを検索…",
    "kudos.filter.noResults": "該当なし",
    "kudos.filter.clearAll": "フィルターをリセット",
    "kudos.empty": "この期間にKudosはありません",
    "kudos.count.one": "件のKudos",
    "kudos.count.other": "件のKudos",
    "kudos.prev": "前へ",
    "kudos.next": "次へ",

    // Admin settings
    "admin.tab.settings": "設定",
    "admin.settings.title": "設定",
    "admin.settings.description": "アプリケーションの設定を管理します。",
    "admin.settings.fiscalQuarterStartMonth": "四半期の開始月",
    "admin.settings.fiscalQuarterDescription":
      "四半期の開始月を設定します。例: 4月に設定すると Q1=4-6月, Q2=7-9月, Q3=10-12月, Q4=1-3月 になります。",
    "admin.settings.fiscalYearLabel": "年度の表記方法",
    "admin.settings.fiscalYearLabelDescription":
      "四半期の年度表記に開始年と終了年のどちらを使うか設定します。例: 2025年7月〜2026年6月の場合、開始年なら「2025」、終了年なら「2026」と表記します。",
    "admin.settings.fiscalYearLabel.start": "開始年",
    "admin.settings.fiscalYearLabel.end": "終了年",
  },
  en: {
    // Nav
    "nav.logout": "Logout",
    "nav.admin": "Admin",
    "nav.tasks": "Tasks",

    // Admin
    "admin.users.title": "User Management",
    "admin.users.description":
      "Admins can perform all task owner actions on any task, regardless of ownership.",
    "admin.role.admin": "Admin",
    "admin.role.user": "User",
    "admin.button.promote": "Promote to admin",
    "admin.button.demote": "Remove admin",
    "admin.confirm.demote": "Remove admin role from this user?",
    "admin.cannotRemoveLastAdmin": "At least one admin must remain",
    "admin.button.deactivate": "Deactivate",
    "admin.button.reactivate": "Reactivate",
    "admin.confirm.deactivate":
      "Deactivate this user? Deactivated users will be excluded from task assignment and snippet processing.",
    "admin.status.deactivated": "Deactivated",
    "admin.you": "you",
    "admin.users.search": "Search by name or email…",
    "admin.users.noResults": "No matching users",
    "admin.users.prev": "Previous",
    "admin.users.next": "Next",
    "admin.users.pageInfo": "{page} / {totalPages}",
    "admin.tab.users": "Users",
    "admin.tab.snippetChannels": "Snippet Channels",

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
    "empty.tasks": "No tasks yet.\nTasks are created automatically from Slack mentions.",
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
    "owners.searchNoResults": "No matching users",
    "button.addOwner": "Add",
    "button.remove": "Remove",

    // Language switcher
    "lang.switch": "日本語",

    // Theme
    "nav.theme.light": "Light mode",
    "nav.theme.dark": "Dark mode",

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
    "slack.modal.assigneesLabel": "Assign to users",
    "slack.modal.groupsLabel": "Assign to groups",
    "slack.modal.originalMessage": "Original message:",
    "slack.modal.duplicate": "A task has already been created from this message: *{taskLink}*",
    "slack.modal.duplicateSubmit": "Create anyway",
    "slack.modal.error": "An error occurred while creating the task. Please try again.",
    "slack.reply.assigned": "Assigned task *{taskLink}* to {who}",
    "slack.reply.fallbackAssignee": "the assignee",

    // Snippets
    "nav.snippets": "Snippets",
    "page.snippets": "Snippets",
    "snippets.period.day": "Day",
    "snippets.period.week": "Week",
    "snippets.period.month": "Month",
    "snippets.period.quarter": "Quarter",
    "snippets.period.year": "Year",
    "snippets.filter.postedBy": "Posted by",
    "snippets.filter.mentions": "Mentions",
    "snippets.filter.mentionedUser": "Mentioned user",
    "snippets.filter.mentionedUsergroup": "Mentioned group",
    "snippets.filter.all": "All",
    "snippets.filter.searchPoster": "Search posters…",
    "snippets.empty": "No snippets for this period",
    "snippets.filter.sectionSelected": "Selected",
    "snippets.filter.sectionUsers": "Users",
    "snippets.filter.sectionGroups": "Groups",
    "snippets.filter.searchUser": "Search users…",
    "snippets.filter.searchUsergroup": "Search groups…",
    "snippets.count.one": "snippet",
    "snippets.count.other": "snippets",
    "snippets.filter.noResults": "No results",
    "snippets.filter.ok": "OK",
    "snippets.filter.clear": "Clear",
    "snippets.filter.clearAll": "Reset filters",
    "snippets.prev": "Previous",
    "snippets.next": "Next",

    // Slack snippet shortcut
    "slack.snippet.title": "Add Snippet",
    "slack.snippet.submit": "Add",
    "slack.snippet.cancel": "Cancel",
    "slack.snippet.close": "Close",
    "slack.snippet.loading": "Processing...",
    "slack.snippet.originalMessage": "Message:",
    "slack.snippet.success": "Snippet added successfully.",
    "slack.snippet.duplicate": "This message has already been added as a snippet.",
    "slack.snippet.error": "An error occurred while adding the snippet. Please try again.",
    "slack.snippet.noMentions": "This message has no mentions and cannot be added as a snippet.",

    // Slack kudos shortcut
    "slack.kudos.title": "Add Kudos",
    "slack.kudos.submit": "Add",
    "slack.kudos.cancel": "Cancel",
    "slack.kudos.close": "Close",
    "slack.kudos.loading": "Processing...",
    "slack.kudos.originalMessage": "Message:",
    "slack.kudos.success": "Kudos added successfully.",
    "slack.kudos.duplicate": "This message has already been added as kudos.",
    "slack.kudos.error": "An error occurred while adding kudos. Please try again.",
    "slack.kudos.noEntries":
      "This message has no kudos entries. Lines must start with a mention.",

    // Admin snippet channels
    "admin.snippetChannels.title": "Snippet Channels",
    "admin.snippetChannels.description":
      "Configure Slack channels to automatically capture daily reports.",
    "admin.snippetChannels.add": "Add channel",
    "admin.snippetChannels.placeholder": "Slack Channel ID",
    "admin.snippetChannels.remove": "Remove",
    "admin.snippetChannels.empty": "No channels configured",
    "admin.snippetChannels.confirmRemove": "Remove this channel?",

    // Admin kudos channels
    "admin.tab.kudosChannels": "Kudos Channels",
    "admin.kudosChannels.title": "Kudos Channels",
    "admin.kudosChannels.description": "Configure Slack channels to automatically capture kudos.",
    "admin.kudosChannels.add": "Add channel",
    "admin.kudosChannels.placeholder": "Slack Channel ID",
    "admin.kudosChannels.remove": "Remove",
    "admin.kudosChannels.empty": "No channels configured",
    "admin.kudosChannels.confirmRemove": "Remove this channel?",

    // Kudos
    "nav.kudos": "Kudos",
    "page.kudos": "Kudos",
    "kudos.period.day": "Day",
    "kudos.period.week": "Week",
    "kudos.period.month": "Month",
    "kudos.period.quarter": "Quarter",
    "kudos.period.year": "Year",
    "kudos.filter.postedBy": "Posted by",
    "kudos.filter.mentionedUser": "To",
    "kudos.filter.all": "All",
    "kudos.filter.searchPoster": "Search posters…",
    "kudos.filter.searchUser": "Search users…",
    "kudos.filter.noResults": "No results",
    "kudos.filter.clearAll": "Reset filters",
    "kudos.empty": "No kudos for this period",
    "kudos.count.one": "kudos entry",
    "kudos.count.other": "kudos entries",
    "kudos.prev": "Previous",
    "kudos.next": "Next",

    // Admin settings
    "admin.tab.settings": "Settings",
    "admin.settings.title": "Settings",
    "admin.settings.description": "Manage application settings.",
    "admin.settings.fiscalQuarterStartMonth": "Fiscal quarter start month",
    "admin.settings.fiscalQuarterDescription":
      "Set the starting month of fiscal quarters. E.g., setting April makes Q1=Apr-Jun, Q2=Jul-Sep, Q3=Oct-Dec, Q4=Jan-Mar.",
    "admin.settings.fiscalYearLabel": "Fiscal year labeling",
    "admin.settings.fiscalYearLabelDescription":
      'Whether to label fiscal years by start or end year. E.g., for Jul 2025 – Jun 2026: start year shows "2025", end year shows "2026".',
    "admin.settings.fiscalYearLabel.start": "Start year",
    "admin.settings.fiscalYearLabel.end": "End year",
  },
};

export default messages;
