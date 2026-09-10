# DetailSearch Linker 1.0.6

## 日本語

### 使い方の改善

- PC版Obsidianでは、語句を選択して **DSL: 選択語を検索** アイコンを押すだけで検索できます。コピーは不要です。
- モバイル版Obsidianでは、語句をコピーして **DSL: コピー語を検索** を実行します。コピー後の選択は自動で解除されるため、自分で解除する必要はありません。
- 虫眼鏡の **DSL: 本文候補を検索** は、どちらの版でも文章から候補を探します。選択やコピーの内容は使いません。
- 候補の表示のためにリーディングモードから切り替えた場合、候補を消すと元のモードへ戻ります。ノートやタブの移動で候補が消える場合も同様です。自分で表示モードを変えた場合は、その操作を尊重します。

### 候補の見つけやすさ

- 「〇〇の」「〇〇し」のような、不自然な区切りの日本語候補を減らしました。すべての不自然な候補を除けるわけではありません。
- 手動辞書に登録した短い語も優先して探します。「漸進」のような語を、長い語の一部に含まれる場合も見つけます。他の検索対象ノートに一致することが必要です。
- 実際にリンクを作成した語を学習する辞書を追加しました。学習した語は設定で編集・削除できます。
- 本文が光りすぎないよう、表示する候補数を自動で調整します。固定上限も選べます。
- モバイル版Obsidianでの候補表示と、隣り合う候補の件数表示を改善しました。

### 説明書の見直し

READMEに、PC版Obsidian・モバイル版Obsidianでの操作、閲覧モードへの復帰、辞書登録の使用例を掲載しました。候補が光らないときの確認手順も追加しています。

検索と候補の表示だけでは、ノート本文にリンクは書き込まれません。内容を確認し、**リンクを作成** を押すと対象箇所をリンクに置き換えます。

[日本語の使い方](https://github.com/zoupuyo-obsidian/obsidian-detailsearch-linker/blob/1.0.6/README.ja.md)

## English

### Easier searches

- In Obsidian desktop, select a phrase and click **DSL: Search selection**. No copying is needed.
- In Obsidian mobile, copy a phrase and run **DSL: Search copied text**. The remaining selection is cleared automatically.
- The magnifying-glass action, **DSL: Find body candidates**, finds phrases from the note on both platforms. It does not use selected or copied text.
- If the plugin temporarily leaves Reading view to show candidates, clearing those candidates restores Reading view. This also applies when switching notes or tabs clears them. Manual view changes are respected.

### Better candidates

- Reduced incomplete Japanese phrases ending in separate fragments such as `の` or `し`. Some awkward boundaries can still remain.
- Manual dictionary terms are prioritized, including short terms inside compound words. A match in another eligible note is still required.
- Added an editable dictionary that learns eligible terms after a link is successfully created.
- Automatic candidate counts reduce crowded highlighting; a fixed-cap option remains available.
- Improved candidate rendering in Obsidian mobile and count badges for adjacent candidates.

### Updated documentation

Both READMEs now include platform-specific steps, examples of returning to Reading view and using dictionaries, and troubleshooting for missing highlights.

Searching and showing candidates do not insert links into note text. Choose **Create link** after reviewing a destination to replace the selected occurrence.

[English guide](https://github.com/zoupuyo-obsidian/obsidian-detailsearch-linker/blob/1.0.6/README.md)
