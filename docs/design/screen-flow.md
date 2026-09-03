# 画面遷移図

MVPの主要画面と遷移をMermaid `flowchart` で示します。画面ID（例: `S_HOME`）はコード実装（ルート名やコンポーネント名）と対応させる想定です。

## 目次

1. [全体サイトマップ](#1-全体サイトマップ)
2. [サインアップフロー（年齢確認込み）](#2-サインアップフロー年齢確認込み)
3. [投稿作成フロー（下書き自動保存込み）](#3-投稿作成フロー下書き自動保存込み)
4. [発見・検索フロー](#4-発見検索フロー)
5. [通報・ブロックフロー](#5-通報ブロックフロー)
6. [カフェ経営者フロー](#6-カフェ経営者フロー)

## 凡例

| 記法 | 意味 |
|---|---|
| `([名前])` | エントリポイント / 終端 |
| `[画面名]` | 通常画面 |
| `[[共通]]` | 共通モジュール（別フローで詳細化） |
| `{判定}` | 条件分岐 |
| `[/入力/]` | 入力ステップ |
| `[\結果\]` | 表示・通知結果 |

---

## 1. 全体サイトマップ

未ログインでも到達可能な範囲と、ログインが必要な範囲を色分け（クラス）で区別。

```mermaid
flowchart TD
    Entry([サイト訪問]) --> Home[S_HOME<br/>ホーム / タイムライン]

    Home --> Explore[S_EXPLORE<br/>発見]
    Home --> MapView[S_MAP<br/>地図ビュー]
    Home --> Search[S_SEARCH<br/>タグ検索]
    Home --> PostDetail[S_POST_DETAIL<br/>投稿詳細]
    Home --> CafeDetail[S_CAFE_DETAIL<br/>カフェ詳細]
    Home --> UserPub[S_USER_PROFILE_PUBLIC<br/>ユーザープロフィール 公開]

    Explore --> PostDetail
    MapView --> CafeDetail
    Search --> PostDetail
    Search --> CafeDetail
    PostDetail --> CafeDetail
    PostDetail --> UserPub
    CafeDetail --> PostDetail
    CafeDetail --> MapView

    Home --> AuthGate{ログイン要求}
    Explore --> AuthGate
    PostDetail --> AuthGate
    CafeDetail --> AuthGate
    MapView --> AuthGate
    UserPub --> AuthGate

    AuthGate -->|未ログインで操作試行| Login[S_LOGIN<br/>ログイン]
    Login --> Signup[S_SIGNUP<br/>新規登録]
    Login --> Home
    Signup --> SignupFlow[[サインアップフロー]]
    SignupFlow --> MyHome

    MyHome[S_MY_HOME<br/>ログイン後ホーム] --> Timeline[S_TIMELINE<br/>フォロー中タイムライン]
    MyHome --> Explore
    MyHome --> MapView
    MyHome --> Notify[S_NOTIFICATIONS<br/>通知]
    MyHome --> MyPage[S_MYPAGE<br/>マイページ]
    MyHome --> PostCompose[[投稿作成フロー]]

    MyPage --> ProfileEdit[S_PROFILE_EDIT<br/>プロフィール編集]
    MyPage --> Favorites[S_FAVORITES<br/>お気に入りカフェ]
    MyPage --> WantToGo[S_WANT_TO_GO<br/>行きたいリスト]
    MyPage --> Bookmarks[S_BOOKMARKS<br/>保存投稿]
    MyPage --> DraftList[S_DRAFTS<br/>下書き一覧]
    MyPage --> Badges[S_BADGES<br/>バッジ / エリア制覇マップ]
    MyPage --> Settings[S_SETTINGS<br/>設定]
    MyPage --> OwnerHub[[カフェ経営者フロー]]

    Settings --> BlockList[S_BLOCKED_USERS<br/>ブロック管理]
    Settings --> AccountDel[S_ACCOUNT_DELETE<br/>アカウント削除]
    Settings --> Logout([ログアウト])
    Logout --> Home

    classDef guest fill:#eef,stroke:#557
    classDef authed fill:#efe,stroke:#575
    classDef gate fill:#ffe,stroke:#a83
    classDef flow fill:#fee,stroke:#a55,stroke-dasharray:4

    class Home,Explore,MapView,Search,PostDetail,CafeDetail,UserPub,Login,Signup guest
    class MyHome,Timeline,Notify,MyPage,ProfileEdit,Favorites,WantToGo,Bookmarks,DraftList,Badges,Settings,BlockList,AccountDel authed
    class AuthGate gate
    class SignupFlow,PostCompose,OwnerHub flow
```

---

## 2. サインアップフロー（年齢確認込み）

`profiles.birth_date` を必須化し、13歳未満をブロック、13〜17歳は保護者同意フローを経る。

```mermaid
flowchart TD
    Start([S_SIGNUP 開始]) --> Method[/認証方式選択<br/>メール or 電話番号/]
    Method --> Cred[/メール or 電話番号<br/>+ パスワード入力/]
    Cred --> Verify[/OTP or メール確認/]
    Verify -->|失敗| Cred
    Verify -->|成功| BirthDate[/生年月日入力<br/>必須/]

    BirthDate --> AgeCheck{年齢判定}
    AgeCheck -->|13歳未満| Block[\S_SIGNUP_BLOCKED<br/>登録不可 説明画面\]
    Block --> End1([終了])

    AgeCheck -->|13歳以上18歳未満| MinorFlow[S_MINOR_CONSENT<br/>保護者情報入力]
    MinorFlow --> GuardianMail[/保護者メール入力/]
    GuardianMail --> SendConsent[[保護者宛<br/>同意メール送信]]
    SendConsent --> Pending[S_ACCOUNT_PENDING<br/>同意待ちステータス<br/>閲覧のみ可]
    Pending --> ConsentClick[[保護者がメールリンクをクリック]]
    ConsentClick --> Activated[S_ACCOUNT_ACTIVATED<br/>アカウント有効化]

    AgeCheck -->|18歳以上| Activated

    Activated --> Onboard1[/S_ONBOARD_PROFILE<br/>username / display_name / avatar/]
    Onboard1 --> Onboard2[/S_ONBOARD_AREA<br/>ホームエリア選択<br/>デフォルト効果/]
    Onboard2 --> Onboard3[/S_ONBOARD_INTERESTS<br/>興味タグ選択<br/>厳選5～7個から/]
    Onboard3 --> MyHome([S_MY_HOME へ])

    classDef block fill:#fdd,stroke:#a33
    classDef pending fill:#ffe,stroke:#a83
    classDef success fill:#dfd,stroke:#3a3
    class Block block
    class Pending,MinorFlow,GuardianMail pending
    class Activated,MyHome success
```

**設計メモ**
- 保護者同意待ち中も閲覧はできる（ログイン不要機能と同等の範囲）
- `profiles.status = 'pending_consent'` の間は投稿・いいね・コメント不可（RLSでガード）
- 年齢判定はクライアント計算だが、DB側にも `CHECK (birth_date <= current_date - interval '13 years')` を配置

---

## 3. 投稿作成フロー（下書き自動保存込み）

損失回避のため、下書き自動保存＋離脱前アラートを組み込む。

```mermaid
flowchart TD
    Trigger([+ ボタン押下]) --> TypeSelect{投稿形式}
    TypeSelect -->|短文| ShortForm[S_POST_SHORT<br/>短文投稿フォーム]
    TypeSelect -->|ブログ| BlogForm[S_POST_BLOG<br/>ブログ投稿エディタ]

    ShortForm --> AddImage[/写真選択 1〜N枚/]
    BlogForm --> AddImage

    AddImage --> ExifStrip[[EXIF除去処理<br/>クライアント側]]
    ExifStrip --> Upload[[S3へアップロード<br/>署名付きURL]]
    Upload --> CafePick[/カフェ選択<br/>マップ or 検索/]
    CafePick --> CafeExists{既存カフェ?}
    CafeExists -->|Yes| TagSuggest[[位置情報からタグサジェスト<br/>デフォルト効果]]
    CafeExists -->|No| NewCafe[S_CAFE_NEW<br/>新規カフェ登録]
    NewCafe --> TagSuggest

    TagSuggest --> TagPick[/タグ選択<br/>最大5個/]
    TagPick --> Body[/本文入力/]

    Body --> AutoSave[[15秒デバウンスで<br/>drafts へ upsert]]
    AutoSave -.->|継続| Body

    Body --> ExitAttempt{離脱操作}
    ExitAttempt -->|閉じる/戻る| ExitConfirm[/離脱前アラート<br/>下書きは保存されています/]
    ExitConfirm -->|続ける| Body
    ExitConfirm -->|離脱| DraftList[S_DRAFTS<br/>下書き一覧に残る]

    Body --> Publish[/公開ボタン/]
    Publish --> NgCheck[[NGワードチェック]]
    NgCheck -->|block一致| NgError[\NGワード検出<br/>本文修正を促す\]
    NgError --> Body
    NgCheck -->|OK or warn| Submit[[posts INSERT<br/>+ post_images INSERT<br/>+ post_tags INSERT]]
    Submit --> DraftDel[[drafts DELETE]]
    DraftDel --> PeakEnd[/S_POST_SUCCESS<br/>マイクロアニメーション<br/>ピークエンド則/]
    PeakEnd --> Detail[S_POST_DETAIL<br/>作成した投稿]
    Detail --> AreaVisit[[area_visits upsert<br/>制覇マップ更新]]
    AreaVisit --> BadgeCheck{バッジ条件達成?}
    BadgeCheck -->|Yes| BadgeGrant[\通知: バッジ獲得\]
    BadgeCheck -->|No| End([完了])
    BadgeGrant --> End

    classDef draft fill:#ffd,stroke:#a83
    classDef success fill:#dfd,stroke:#3a3
    classDef error fill:#fdd,stroke:#a33
    class AutoSave,ExitConfirm,DraftList draft
    class PeakEnd,BadgeGrant success
    class NgError error
```

**設計メモ**
- `drafts.client_draft_key` はブラウザ側で UUID を発行し LocalStorage 保持。異なる端末で編集した場合は別下書き扱い
- EXIF除去に失敗した場合はアップロード中止（プライバシー優先）
- 公開後の投稿IDと `drafts` の紐付け履歴は残さない（削除のみ）

---

## 4. 発見・検索フロー

「選択のパラドックス」を避けるため、初期状態でおすすめ順を提示し、絞り込みは段階的に。

```mermaid
flowchart TD
    Enter([S_EXPLORE / S_SEARCH]) --> Default[S_EXPLORE_DEFAULT<br/>おすすめ順 タイムライン]
    Default --> Filter{絞り込み}

    Filter -->|エリア| AreaPick[/S_FILTER_AREA<br/>都道府県→市区→エリア/]
    Filter -->|雰囲気| MoodPick[/S_FILTER_MOOD<br/>厳選タグ 5-7個/]
    Filter -->|利用機会| OccasionPick[/S_FILTER_OCCASION<br/>一人 / 朝 / デート等/]
    Filter -->|フリー入力| KeywordPick[/S_FILTER_KEYWORD<br/>全文検索/]
    Filter -->|地図で見る| SwitchMap[S_MAP<br/>地図ビュー]

    AreaPick --> Result[S_SEARCH_RESULT<br/>検索結果一覧]
    MoodPick --> Result
    OccasionPick --> Result
    KeywordPick --> Result

    Result --> ResultEmpty{件数}
    ResultEmpty -->|0件| Suggest[\関連タグ提案<br/>近隣エリア提案\]
    ResultEmpty -->|1件以上| Detail[S_POST_DETAIL<br/>or<br/>S_CAFE_DETAIL]

    Suggest --> Filter

    SwitchMap --> MapMarker[/マーカータップ/]
    MapMarker --> MapCard[S_MAP_CARD<br/>カフェミニカード]
    MapCard --> CafeDetail[S_CAFE_DETAIL]
    CafeDetail --> AddList{リスト追加}
    AddList -->|お気に入り| AddFav[[user_cafe_lists INSERT<br/>type=favorite]]
    AddList -->|行きたい| AddWant[[user_cafe_lists INSERT<br/>type=want_to_go]]
    AddFav --> CafeDetail
    AddWant --> CafeDetail

    Detail --> DetailAction{アクション}
    DetailAction -->|いいね| Like[[likes INSERT<br/>通知: 返報性]]
    DetailAction -->|保存| Bookmark[[post_bookmarks INSERT]]
    DetailAction -->|コメント| Comment[[comments INSERT]]
    DetailAction -->|フォロー| Follow[[follows INSERT]]

    classDef start fill:#eef,stroke:#557
    classDef action fill:#efe,stroke:#575
    class Default,Enter start
    class Like,Bookmark,Comment,Follow,AddFav,AddWant action
```

**設計メモ**
- タグの多階層UIは避け、`is_curated=true` を優先表示
- 0件時の代替提案は行動経済学の「選択回避」を防ぐため必須
- 地図ビューはクラスタリング表示（多量マーカーの認知負荷回避）

---

## 5. 通報・ブロックフロー

ユーザーが違反コンテンツを検出してから運営処理まで。

```mermaid
flowchart TD
    Detail([投稿 / コメント / プロフィール 表示中]) --> Menu[/メニュー … を開く/]
    Menu --> Choice{選択}

    Choice -->|通報| ReportForm[S_REPORT_FORM<br/>通報理由選択]
    Choice -->|ブロック| BlockConfirm[/ブロック確認/]
    Choice -->|非表示| Hide[[クライアント側で非表示]]

    ReportForm --> Reason[/理由: spam / 嫌がらせ /<br/>未成年リスク / その他/]
    Reason --> Desc[/自由記述 任意/]
    Desc --> ReportSubmit[[reports INSERT<br/>status=pending]]
    ReportSubmit --> ReportDone[\S_REPORT_DONE<br/>受付完了メッセージ\]

    BlockConfirm -->|確定| BlockInsert[[blocks INSERT]]
    BlockInsert --> BlockDone[\相手投稿を非表示化<br/>相互のいいね等も遡及非表示\]

    ReportDone --> Detail
    BlockDone --> Detail
    Hide --> Detail

    subgraph 運営側 [運営モデレーション]
        Queue([S_ADMIN_REPORTS<br/>通報キュー])
        Queue --> Review[S_ADMIN_REVIEW<br/>個別レビュー]
        Review --> Decision{判定}
        Decision -->|違反あり| ActionSelect{対応}
        ActionSelect -->|投稿非表示| HidePost[[posts.status=hidden]]
        ActionSelect -->|ユーザー停止| Suspend[[profiles.status=suspended]]
        ActionSelect -->|コメント削除| DelCom[[comments.deleted_at=now]]
        Decision -->|違反なし| Reject[[reports.status=rejected]]
        HidePost --> LogAudit[[audit_logs INSERT]]
        Suspend --> LogAudit
        DelCom --> LogAudit
        Reject --> LogAudit
        LogAudit --> ResolvedNotify[\通報者・被通報者に通知\]
        ResolvedNotify --> Queue
    end

    ReportSubmit -.->|キューに登場| Queue

    classDef user fill:#eef,stroke:#557
    classDef admin fill:#fef,stroke:#75a
    classDef success fill:#dfd,stroke:#3a3
    class Detail,Menu,ReportForm,BlockConfirm user
    class Queue,Review,Decision,ActionSelect admin
    class ReportDone,BlockDone success
```

**設計メモ**
- NGワードの `block` は投稿時に自動ブロックするため、`reports` はユーザー起点のみ
- 相互ブロック（お互いに見えなくする）はブロック時点で自動適用

---

## 6. カフェ経営者フロー

一般ユーザーからのオーナー認証申請と、認証後のダッシュボード。

```mermaid
flowchart TD
    Cafe([S_CAFE_DETAIL 閲覧中]) --> ClaimBtn[/このカフェのオーナーですか?<br/>認証申請/]
    ClaimBtn --> ClaimForm[S_OWNER_CLAIM<br/>認証申請フォーム]
    ClaimForm --> UploadDocs[/身分証・営業許可等<br/>書類アップロード/]
    UploadDocs --> Submit[[cafe_owner_verifications INSERT<br/>status=pending]]
    Submit --> Pending[\S_OWNER_PENDING<br/>審査中メッセージ\]

    Pending -.->|運営審査| AdminReview[S_ADMIN_OWNER_REVIEW<br/>認証レビュー]
    AdminReview --> ReviewDecision{判定}
    ReviewDecision -->|承認| Approve[[status=approved<br/>cafes.verified_owner_id=user_id<br/>profiles.role=owner]]
    ReviewDecision -->|却下| Reject[[status=rejected<br/>理由コメント]]
    Approve --> NotifyOK[\通知: 承認完了\]
    Reject --> NotifyNG[\通知: 却下と理由\]

    NotifyOK --> Dashboard[S_OWNER_DASHBOARD<br/>経営者ダッシュボード]
    Dashboard --> InfoEdit[S_OWNER_CAFE_EDIT<br/>店舗情報編集<br/>営業時間 / 説明 / 写真]
    Dashboard --> Analytics[S_OWNER_ANALYTICS<br/>投稿分析<br/>言及数 / いいね数 / 保存数]
    Dashboard --> Verified[\プロフィールに<br/>認証バッジ表示\]

    InfoEdit --> SaveInfo[[cafes UPDATE<br/>+ cafe_business_hours UPSERT]]
    SaveInfo --> Dashboard

    NotifyNG --> ClaimForm

    classDef pending fill:#ffe,stroke:#a83
    classDef success fill:#dfd,stroke:#3a3
    classDef admin fill:#fef,stroke:#75a
    class Pending,NotifyNG pending
    class Approve,NotifyOK,Dashboard,Verified success
    class AdminReview,ReviewDecision admin
```

**設計メモ**
- 認証書類は Supabase Storage の非公開バケットに保管、admin のみアクセス可
- 承認後は `profiles.role = 'owner'` を付与し、RLSで店舗情報編集を許可
- 分析ダッシュボードのデータは Materialized View で日次更新（MVP）→ 成長後にリアルタイム化

---

## 未整理・後回しの遷移

以下は本ドキュメントに含めていません:

- 通知詳細ページからの深堀り遷移
- パスワードリセットフロー
- メールアドレス変更フロー
- 退会（論理削除）確認フロー
- iOS/Android アプリ化時のディープリンク遷移

これらは実装フェーズで必要になったタイミングで追記します。
