// ==UserScript==
// @name         hatebuToBluesky
// @namespace    http://tampermonkey.net/snow113/hatebuToBluesky/
// @version      2024-03-03
// @downloadURL  https://github.com/snow113-gt/userscript/blob/master/HatebuToBluesky/HatebuToBluesky.user.js
// @updateURL    https://github.com/snow113-gt/userscript/blob/master/HatebuToBluesky/HatebuToBluesky.user.js
// @supportURL   https://github.com/snow113-gt/userscript/blob/master/HatebuToBluesky/
// @description  はてなブックマークのブックマーク内容をBlueskyに投稿するユーザースクリプト
// @author       snow113
// @match        https://b.hatena.ne.jp/%はてなのユーザーID%/*
// @icon         https://bsky.app/static/favicon-16x16.png
// @grant        GM_xmlhttpRequest
// @connect      bsky.social
// @connect      cdn-ak-scissors.b.st-hatena.com
// @connect      cdn-ak-scissors.favicon.st-hatena.com
// @connect      cdn-ak2.favicon.st-hatena.com
// @connect      www.youtube.com
// @connect      i.ytimg.com
// ==/UserScript==

(function() {
    'use strict';
    // Blueskyのユーザー名: example.bsky.social
    const BLUESKY_HANDLE = "%BlueskyのユーザーID%.bsky.social";
    // Blueskyのアプリパスワード: https://bsky.app/settings/app-passwords で作成したものを設定
    const BLUESKY_APP_PASS = "%Blueskyのアプリパスワード%";
    // 投稿時の接頭辞: 不要な場合は空文字にする
    const COMMENT_PREFIX = "【はてブから転載】";
    // 投稿先のPDS: 自分で建てたPDSなどを投稿先にする場合は変更する
    const BLUESKY_PDS_URL = 'https://bsky.social';
    // ボタンアイコンの画像
    const BUTTON_IMAGE = "https://bsky.app/static/favicon-16x16.png";

    /**
     * ログ出力
     */
    class Logger {
        logLevel = Logger.LogLevel.Info;

        /**
         * ログレベル
         */
        static LogLevel = {
            Trace: 1,
            Debug: 2,
            Info: 3,
            Warning: 4,
            Error: 5,
        };

        /**
         * トレースログを出力する
         * @param processName 機能名
         * @param messsage 出力メッセージ
         * @param error エラーオブジェクト
         */
        static trace(processName, message, error) {
            Logger.outputLog(Logger.LogLevel.Trace, processName, message, error);
        }

        /**
         * デバッグログを出力する
         * @param processName 機能名
         * @param messsage 出力メッセージ
         * @param error エラーオブジェクト
         */
        static debug(processName, message, error) {
            Logger.outputLog(Logger.LogLevel.Debug, processName, message, error);
        }

        /**
         * ログを出力する
         * @param processName 機能名
         * @param messsage 出力メッセージ
         * @param error エラーオブジェクト
         */
        static info(processName, message, error) {
            Logger.outputLog(Logger.LogLevel.Info, processName, message, error);
        }

        /**
         * 警告ログを出力する
         * @param processName 機能名
         * @param messsage 出力メッセージ
         * @param error エラーオブジェクト
         */
        static warning(processName, message, error) {
            Logger.outputLog(Logger.LogLevel.Warning, processName, message, error);
        }

        /**
         * エラーログを出力する
         * @param processName 機能名
         * @param messsage 出力メッセージ
         * @param error エラーオブジェクト
         */
        static error(processName, message, error) {
            Logger.outputLog(Logger.LogLevel.Error, processName, message, error);
            alert(message+": \n\t"+error);
        }

        /**
         * ログ出力
         * @param level ログ出力レベル
         * @param processName 機能名
         * @param messsage 出力メッセージ
         * @param error エラーオブジェクト
         */
        static outputLog(level, processName, message, error) {
            if (level >= this.logLevel) {
                const outputData = [ Logger.getLogLevelName(level), processName, message, error ];
                switch (this.logLevel) {
                    case Logger.LogLevel.Trace:
                    case Logger.LogLevel.Debug:
                        console.debug(outputData);
                        break;
                    case Logger.LogLevel.Info:
                        console.info(outputData);
                        break;
                    case Logger.LogLevel.Warning:
                        console.warn(outputData);
                        break;
                    case Logger.LogLevel.Error:
                        console.error(outputData);
                        break;
                    default:
                        break;
                }
            }
        }

        /**
         * ログレベル名を返す
         * @param logLevel ログ出力レベル
         * @return ログレベル名
         */
        static getLogLevelName(logLevel) {
            switch (logLevel) {
                case Logger.LogLevel.Trace:
                    return "Trace";
                case Logger.LogLevel.Debug:
                    return "Debug";
                case Logger.LogLevel.Info:
                    return "Info";
                case Logger.LogLevel.Warning:
                    return "Warning";
                case Logger.LogLevel.Error:
                    return "Error";
                default:
                    return undefined;
            }
        }
    }

    /**
     * DOM操作
     */
    class DOMUtility {
        /**
         * タグを返す
         * @param baseNode 検索の起点となるタグ
         * @param selectors タグの取得ルール
         * @return タグ
         */
        static getNode(baseNode, selectors) {
            return baseNode.querySelector(selectors);
        }

        /**
         * タグの値を返す
         * @param baseNode 検索の起点となるタグ
         * @param selectors タグの取得ルール
         * @return タグの値
         */
        static getNodeText(baseNode, selectors) {
            return baseNode.querySelector(selectors).innerText ?? "";
        }

        /**
         * 属性の値を返す
         * @param baseNode 検索の起点となるタグ
         * @param attrName 属性名
         * @return 属性の値
         */
        static getAttrText(baseNode, attrName) {
            return baseNode.getAttribute(attrName) ?? "";
        }

        /**
         * OGデータから画像URLを返す
         * @param targetUrl OGデータを取得するURL
         * @return 画像URL
         */
        static async getOgImage(targetUrl) {
            return new Promise((resolve, reject) => {
                const details = {
                    method: "GET",
                    url: targetUrl,
                    onload: response => {
                        const html = response.responseText;
                        const doc = new DOMParser().parseFromString(html, 'text/html');
                        const imageUrl = doc.head.querySelector("meta[property='og:image']").content ?? "";
                        resolve(imageUrl);
                    },
                    withCredentials: true,
                };
                Logger.trace("getOgImage", details);
                GM_xmlhttpRequest(details);
            });
        }
    }

    /**
     * ブックマークデータ
     */
    class BookmarkData {
        /** タグを含むコメント */
        baseComment;
        /** ブックマーク先のURL */
        linkUrl;
        /** ブックマーク先のタイトル */
        linkText;
        /** ブックマーク先の説明文 */
        linkDescription;
        /** ブックマーク先のサムネ画像のURL */
        imageUrl;

        /**
         * コンストラクタ
         */
        constructor() {
        }

        /**
         * ブックマークデータのインスタンスを返す
         * @param bookmarkNode ブックマークアイテムのノード
         * @return ブックマークデータのインスタンス
         */
        static async dataFactory(bookmarkNode) {
            const data = new BookmarkData();

            data.baseComment = data.getBaseComment(bookmarkNode);
            data.linkUrl = data.getBookmarkUrl(bookmarkNode);
            data.linkText = data.getBookmarkTitle(bookmarkNode);
            data.linkDescription = data.getBookmarkDescription(bookmarkNode);
            data.imageUrl = await data.getBookmarkImageUrl(bookmarkNode);

            return data;
        }

        /**
         * タグを含むコメントを返す
         * @param bookmarkNode ブックマークアイテムのノード
         * @return 投稿用コメント
         */
        getBaseComment(bookmarkNode) {
            const bkTags = this.getBookmarkTags(bookmarkNode);
            const bkComments = this.getBookmarkComments(bookmarkNode);

            return COMMENT_PREFIX+bkTags+" "+bkComments+" ";
        }

        /**
         * ブックマークタグを返す
         * @param bookmarkNode ブックマークアイテムのノード
         * @return ブックマークタグ
         */
        getBookmarkTags(bookmarkNode) {
            let node = DOMUtility.getNode(bookmarkNode, "ul.centerarticle-reaction-tags");
            if (node) {
                let tagText = "";
                const nodes = node.childNodes;
                for (let i=0;i<nodes.length; i++) {
                    const tagNode = nodes[i];
                    if (tagNode.innerText) {
                        tagText+="["+tagNode.innerText+"]";
                    }
                }
                return tagText;
            }
            return "";
        }

        /**
         * ブックマークコメントを返す
         * @param bookmarkNode ブックマークアイテムのノード
         * @return ブックマークコメント
         */
        getBookmarkComments(bookmarkNode) {
            return DOMUtility.getNodeText(bookmarkNode, "span.js-comment");
        }

        /**
         * ブックマークURLを返す
         * @param bookmarkNode ブックマークアイテムのノード
         * @return ブックマークURL
         */
        getBookmarkUrl(bookmarkNode) {
            return DOMUtility.getAttrText(bookmarkNode, "data-target-url");
        }

        /**
         * ブックマークタイトルを返す
         * @param bookmarkNode ブックマークアイテムのノード
         * @return ブックマークタイトル
         */
        getBookmarkTitle(bookmarkNode) {
            return DOMUtility.getNodeText(bookmarkNode, "a.js-clickable-link");
        }

        /**
         * ブックマークの説明文を返す
         * @param bookmarkNode ブックマークアイテムのノード
         * @return ブックマークの説明文
         */
        getBookmarkDescription(bookmarkNode) {
            return DOMUtility.getNodeText(bookmarkNode, "p.centerarticle-entry-summary");
        }

        /**
         * ブックマークのサムネ画像のURLを返す
         * @param bookmarkNode ブックマークアイテムのノード
         * @return ブックマークのサムネ画像のURL
         */
        async getBookmarkImageUrl(bookmarkNode) {
            let imageUrl;

            try {
                // サムネ画像のタグを取得
                let imageNode = DOMUtility.getNode(bookmarkNode, "a.centerarticle-entry-image img");
                if (!imageNode) {
                    // サムネ画像のタグが取得できない場合はog:imageを取得
                    imageUrl = await DOMUtility.getOgImage(this.linkUrl);
                    if (!imageUrl) {
                        // og:imageが取得できない場合はfavicon画像のタグを取得
                        imageNode = DOMUtility.getNode(bookmarkNode, "img.centerarticle-entry-favicon");
                    }
                }

                if (imageNode) {
                    // タグからURLを取得
                    imageUrl = DOMUtility.getAttrText(imageNode, "src");
                }
            }
            catch (error) {
                Logger.info("getBookmarkImageUrl", "画像の取得に失敗", error);
            }

            return imageUrl;
        }
    }

    /**
     * 投稿データ作成処理
     */
    class PostDataBuilder {
        /** ブックマークデータ */
        bookmarkData;
        /** 画像データ */
        imageData;

        /**
         * コンストラクタ
         */
        constructor() {
        }

        /**
         * 投稿データ作成処理のインスタンスを返す
         * @param bookmarkData ブックマークデータ
         * @return 投稿データ作成処理のインスタンス
         */
        static async builderFactory(bookmarkData) {
            const data = new PostDataBuilder();

            data.bookmarkData = bookmarkData;
            data.imageData = await data.getImageBlob(bookmarkData.imageUrl);

            return data;
        }

        /**
         * リンクカード形式の投稿用データを作成して返す
         * @param blobData BLOBデータ
         * @return リンクカード形式の投稿用データ
         */
        createSocialCardPostData(blobData) {
            const now = this.getDateTime();

            return {
                'text': this.bookmarkData.baseComment,
                'createdAt': now,
                'embed': {
                    '$type': 'app.bsky.embed.external',
                    'external': {
                        'uri': this.bookmarkData.linkUrl,
                        'title': this.bookmarkData.linkText,
                        'description': this.bookmarkData.linkDescription,
                        'thumb': blobData.blob,
                    },
                },
            };
        }

        /**
         * テキスト形式の投稿用データを作成して返す
         * @return テキスト形式の投稿用データ
         */
        createTextPostData() {
            const postComment = this.bookmarkData.baseComment+this.bookmarkData.linkText;
            const facets = this.createPostFacets();
            const now = this.getDateTime();

            return {
                '$type': 'app.bsky.feed.post',
                'text': postComment,
                'facets': facets,
                'createdAt': now,
            };
        }

        /**
         * 投稿用リッチテキストデータを作成して返す
         * @return 投稿用リッチテキストデータ
         */
        createPostFacets() {
            const encoder = new TextEncoder();
            const beginLink = encoder.encode(this.bookmarkData.baseComment).byteLength;
            const endLink = beginLink + encoder.encode(this.bookmarkData.linkText).byteLength;

            return [{
                index: { byteStart: beginLink, byteEnd: endLink },
                features: [{
                    $type: "app.bsky.richtext.facet#link",
                    uri: this.bookmarkData.linkUrl,
                },],
            },];
        }

        /**
         * 画像BLOBデータを返す
         * @param imageUrl 画像URL
         * @return 画像BLOBデータ
         */
        async getImageBlob(imageUrl) {
            return new Promise((resolve, reject) => {
                const details = {
                    method: "GET",
                    url: imageUrl,
                    onload: ({response}) => {
                        const arrayBuffer = response;
                        resolve(arrayBuffer);
                    },
                    withCredentials: true,
                    responseType: 'blob',
                };
                Logger.trace("getImageBlob", details);
                GM_xmlhttpRequest(details);
            });
        }

        /**
         * 現在日時を返す
         */
        getDateTime() {
            return (new Date()).toISOString();
        }
    }

    /**
     * Bluesky処理
     */
    class BlueskyProcess {
        /** BlueskyのユーザーID */
        bskyHandle;
        /** Blueskyのアプリパスワード */
        bskyAppPassword;
        /** Blueskyのセッション情報 */
        bskySession;

        /**
         * コンストラクタ
         * @param bskyHandle ユーザーID
         * @param bskyAppPassword アプリパスワード
         */
        constructor(bskyHandle, bskyAppPassword) {
            this.bskyHandle = bskyHandle;
            this.bskyAppPassword = bskyAppPassword;
        }

        /**
         * ログイン処理
         */
        async login() {
            return new Promise((resolve, reject) => {
                const details = {
                    method: "POST",
                    url: BLUESKY_PDS_URL + '/xrpc/com.atproto.server.createSession',
                    headers: {
                        'Content-Type': 'application/json; charset=UTF-8',
                    },
                    data: JSON.stringify({
                        identifier: this.bskyHandle,
                        password: this.bskyAppPassword,
                    }),
                    onload: (response) => {
                        const session = JSON.parse(response.responseText);
                        if (session.error) {
                            reject(session.message);
                        }
                        this.bskySession = session;
                        resolve(session);
                    },
                    onerror: reject,
                };
                Logger.trace("login", details);
                GM_xmlhttpRequest(details);
            });
        }

        /**
         * セッション更新
         */
        async refreshSession()
        {
            return new Promise((resolve, reject) => {
                const details = {
                    method: "POST",
                    url: BLUESKY_PDS_URL + '/xrpc/com.atproto.server.refreshSession',
                    headers: {
                        'Content-Type': 'application/json; charset=UTF-8',
                        'Authorization': 'Bearer ' + this.bskySession.refreshJwt,
                    },
                    onload: (response) => {
                        const session = JSON.parse(response.responseText);
                        if (session.error) {
                            reject(session.message);
                        }
                        this.bskySession = session;
                        resolve(session);
                    },
                    onerror: reject,
                };
                Logger.trace("refreshSession", details);
                GM_xmlhttpRequest(details);
            });
        }

        /**
         * セッション確認
         */
        async verifySession() {
            if (this.bskySession) {
                try {
                    // 接続済のときは更新
                    return await this.refreshSession();
                }
                catch (error) {
                    // 更新失敗のときはログイン
                    return await this.login();
                }
            }
            else {
                // 未設定のときはログイン
                return this.login();
            }
        }

        /**
         * Blueskyに投稿する
         * @param postData 投稿データ
         * @return 実行結果
         */
        async postBluesky(postData) {
            try {
                await this.verifySession()
                    .then((session) => {
                    if (session.error)
                    {
                        throw new Error(session.message);
                    }
                    this.setLocalStorageValue('bskySession', session);
                });

                return new Promise((resolve, reject) => {
                    const details = {
                        method: "POST",
                        url: BLUESKY_PDS_URL + '/xrpc/com.atproto.repo.createRecord',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': 'Bearer ' + this.bskySession.accessJwt,
                        },
                        fetch: true,
                        data: JSON.stringify({
                            repo: this.bskySession.did,
                            collection: 'app.bsky.feed.post',
                            record: postData,
                        }),
                        onload: ({response}) => {
                            resolve(response);
                        },
                        withCredentials: true,
                        responseType: 'json',
                    };
                    Logger.trace("postBluesky", details);
                    GM_xmlhttpRequest(details);
                });
            }
            catch (error) {
                Logger.error("postBluesky", "Blueskyへの投稿に失敗", error);
            }
        }

        /**
         * BlueskyのPDSにBLOBデータを投稿する
         * @param postBlobData BLOBデータ
         * @return 実行結果
         */
        async postBlobData(postBlobData) {
            try {
                await this.verifySession()
                    .then((session) => {
                    if (session.error)
                    {
                        throw new Error(session.message);
                    }
                    this.setLocalStorageValue('bskySession', session);
                });

                return new Promise((resolve, reject) => {
                    const details = {
                        method: "POST",
                        url: BLUESKY_PDS_URL + '/xrpc/com.atproto.repo.uploadBlob',
                        headers: {
                            'Content-Type': postBlobData.type,
                            'Authorization': 'Bearer ' + this.bskySession.accessJwt,
                        },
                        fetch: true,
                        data: postBlobData,
                        onload: ({response}) => {
                            resolve(response);
                        },
                        withCredentials: true,
                        responseType: 'json',
                    };
                    Logger.trace("postBlobData", details);
                    GM_xmlhttpRequest(details);
                });
            }
            catch (error) {
                Logger.warning("postBlobData", "PDSへのBLOBアップロードに失敗", error);
                throw error;
            }
        }

        /**
         * GM_setValue代替
         */
        setLocalStorageValue(key , value) {
            window.localStorage.setItem(key , value);
        }
    }

    /**
     * Bluesky投稿ボタンの処理
     * @param bookmarkNode ブックマークアイテムのノード
     * @return 実行結果
     */
    const blueskyButtonAction = async function(bookmarkNode) {
        const bookmarkData = await BookmarkData.dataFactory(bookmarkNode);
        const builder = await PostDataBuilder.builderFactory(bookmarkData);

        if (confirm("「"+bookmarkData.linkText+"」をBlueskyに投稿します")) {
            let postData;
            try {
                if (builder.imageData) {
                    // 画像がある場合はPDSに投稿
                    const blobData = await blueskyCon.postBlobData(builder.imageData);
                    // リンクカード形式の投稿データを作成
                    postData = builder.createSocialCardPostData(blobData);
                }
            } catch (error) {
                Logger.warning("blueskyButtonAction", "リンクカードの生成に失敗", error);
            }

            if (!postData) {
                // リンクカード形式にできない時はテキスト形式の投稿データを作成
                postData = builder.createTextPostData();
            }

            return await blueskyCon.postBluesky(postData);
        }

        return false;
    }

    /**
     * Bluesky投稿ボタンを作成して返す
     * @param bookmarkNode ブックマークアイテムのノード
     * @return Bluesky投稿ボタン
     */
    const createBaseIcon = function(bookmarkNode) {
        const buttonNode = document.createElement("input");
        buttonNode.type = "image";
        buttonNode.src = BUTTON_IMAGE;
        buttonNode.classList.add("bskyBtnCss");
        buttonNode.addEventListener("click", ()=> {return blueskyButtonAction(bookmarkNode); }, false);

        const liNode = document.createElement("li");
        liNode.classList.add("bskyBtnCss");
        liNode.append(buttonNode);

        return liNode;
    };

    // Your code here...
    const valTargetCss = "ul.centerarticle-reaction-menu";

    // ログ出力レベル
    Logger.logLevel = Logger.LogLevel.Info;

    // Bluesky投稿ボタンのスタイルを定義
    let css = `.bskyBtnCss { display: block; margin: auto; }`;
    let style = document.createElement('style');
    style.innerHTML = css;
    document.head.append(style);

    const blueskyCon = new BlueskyProcess(BLUESKY_HANDLE, BLUESKY_APP_PASS);
    const bookmarkNodes = document.querySelectorAll("li.bookmark-item");

    if (bookmarkNodes) {
        bookmarkNodes.forEach(function(bookmarkNode) {
            // ブックマークアイテムにBluesky投稿ボタンを追加
            const iconNode = createBaseIcon(bookmarkNode);
            const node = bookmarkNode.querySelector(valTargetCss);
            node.prepend(iconNode);
        });
    }

})();
