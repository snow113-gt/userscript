// ==UserScript==
// @name         hatebuToBluesky
// @namespace    http://tampermonkey.net/snow113/hatebuToBluesky/
// @version      2024-02-24
// @updateURL    https://github.com/snow113-gt/userscript/blob/master/HatebuToBluesky/HatebuToBluesky.user.js
// @description  はてなブックマークのブックマーク内容をBlueskyに投稿するユーザースクリプト
// @author       snow113
// @match        https://b.hatena.ne.jp/%はてなのユーザーID%/bookmark*
// @icon         https://bsky.app/static/favicon-16x16.png
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      bsky.social
// @connect      cdn-ak-scissors.b.st-hatena.com
// @connect      cdn-ak-scissors.favicon.st-hatena.com
// @connect      cdn-ak2.favicon.st-hatena.com
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
     * Blueskyへの投稿機能を付与したノードを作成して返す
     * @param bookmarkNode ブックマークアイテムのノード
     * @return 投稿用ノード
     */
    const createBaseIcon = function (bookmarkNode) {
        var buttonNode = document.createElement("input");
        buttonNode.setAttribute("type","image");
        buttonNode.setAttribute("src", BUTTON_IMAGE);
        buttonNode.addEventListener("click", ()=> {return postBluesky(bookmarkNode); }, false);

        return buttonNode;
    };

    /**
     * Blueskyに投稿する
     * @param bookmarkNode ブックマークアイテムのノード
     * @return 実行結果
     */
    const postBluesky = async function (bookmarkNode) {
        try {
            console.log(blueskyClient);
            await blueskyClient.verify_session()
                .then((session) => {
                if (session.error)
                {
                    throw new Error(session.message);
                }
                GM_setValue('bsky_session', session);
            });

            let postData = {};
            let postText = "";
            try {
                postData = await createBookmarkPostData(bookmarkNode);
                postText = postData.text+" "+postData.embed.external.title;
            } catch (error) {
                // リンクカード形式にできない時は通常のテキストとして投稿
                console.log("リンクカードの生成に失敗："+error);
                postData = createTextPostData(bookmarkNode);
                postText = postData.text;
            }

            if (confirm("「"+postText+"」をBlueskyに投稿します")) {
                return new Promise((resolve, reject) => {
                    GM_xmlhttpRequest({
                        method: "POST",
                        url: BLUESKY_PDS_URL + '/xrpc/com.atproto.repo.createRecord',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': 'Bearer ' + blueskyClient._session.accessJwt,
                        },
                        fetch: true,
                        data: JSON.stringify({
                            repo: blueskyClient._session.did,
                            collection: 'app.bsky.feed.post',
                            record: postData,
                        }),
                        onload: ({response}) => {
                            resolve(response);
                        },
                        withCredentials: true,
                        responseType: 'json',
                    });
                });
            }
        }
        catch (e) {
            console.log(e);
        }
    };

    /**
     * BlueskyのPDSにBLOBデータを投稿する
     * @param postBlobData BLOBデータ
     * @return 実行結果
     */
    const postBlobData = async function (postBlobData) {
        try {
            console.log(blueskyClient);
            await blueskyClient.verify_session()
                .then((session) => {
                if (session.error)
                {
                    throw new Error(session.message);
                }
                GM_setValue('bsky_session', session);
            });

            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: "POST",
                    url: BLUESKY_PDS_URL + '/xrpc/com.atproto.repo.uploadBlob',
                    headers: {
                        'Content-Type': postBlobData.type,
                        'Authorization': 'Bearer ' + blueskyClient._session.accessJwt,
                    },
                    fetch: true,
                    data: postBlobData,
                    onload: ({response}) => {
                        resolve(response);
                    },
                    withCredentials: true,
                    responseType: 'json',
                });
            });
        }
        catch (e) {
            console.log(e);
        }
    };

    /**
     * ブックマーク投稿用データを作成して返す
     * @param bookmarkNode ブックマークアイテムのノード
     * @return ブックマーク投稿用データ
     */
    const createBookmarkPostData = async function (bookmarkNode) {
        const postComment = getBaseComment(bookmarkNode);
        const now = (new Date()).toISOString();
        const linkUrl = getBookmarkUrl(bookmarkNode);
        const linkText = getBookmarkTitle(bookmarkNode);
        const linkDescription = getBookmarkDescription(bookmarkNode);
        const imageData = await getBookmarkImage(bookmarkNode);

        // 画像をPDSに投稿
        const blobData = await postBlobData(imageData);

        return {
            'text': postComment,
            'createdAt': now,
            'embed': {
                '$type': 'app.bsky.embed.external',
                'external': {
                    'uri': linkUrl,
                    'title': linkText,
                    'description': linkDescription,
                    'thumb': blobData.blob,
                },
            },
        };
    };

    /**
     * テキスト投稿用データを作成して返す
     * @param bookmarkNode ブックマークアイテムのノード
     * @return 投稿用データ
     */
    const createTextPostData = function (bookmarkNode) {
        const baseComment = getBaseComment(bookmarkNode);
        const linkText = getBookmarkTitle(bookmarkNode);
        const linkUrl = getBookmarkUrl(bookmarkNode);

        const postComment = baseComment+linkText;
        const facets = createPostFacets(baseComment, linkText, linkUrl);
        const now = (new Date()).toISOString();

        return {
            '$type': 'app.bsky.feed.post',
            'text': postComment,
            'facets': facets,
            'createdAt': now,
        };
    };

    /**
     * 投稿用リッチテキストデータを作成して返す
     * @param comment コメント
     * @param linkText リンクテキスト
     * @param linkUrl リンクURL
     * @return 投稿用リッチテキストデータ
     */
    const createPostFacets = function (comment, linkText, linkUrl) {
        const encoder = new TextEncoder();
        const beginLink = encoder.encode(comment).byteLength;
        const endLink = beginLink + encoder.encode(linkText).byteLength;

        return [{
            index: { byteStart: beginLink, byteEnd: endLink },
            features: [{
                $type: "app.bsky.richtext.facet#link",
                uri: linkUrl,
            },],
        },];
    };

    /**
     * 投稿用コメントを返す
     * @param bookmarkNode ブックマークアイテムのノード
     * @return 投稿用コメント
     */
    const getBaseComment = function (bookmarkNode) {
        const bkTags = getBookmarkTags(bookmarkNode);
        const bkComments = getBookmarkComments(bookmarkNode);

        return COMMENT_PREFIX+bkTags+" "+bkComments+" ";
    };

    /**
     * ブックマークタグを返す
     * @param bookmarkNode ブックマークアイテムのノード
     * @return ブックマークタグ
     */
    const getBookmarkTags = function (bookmarkNode) {
        let text = getNodeText(bookmarkNode, "ul.centerarticle-reaction-tags");
        if (text) {
            return "["+text.replaceAll(" ","][")+"]";
        }
        return "";
    };

    /**
     * ブックマークコメントを返す
     * @param bookmarkNode ブックマークアイテムのノード
     * @return ブックマークコメント
     */
    const getBookmarkComments = function (bookmarkNode) {
        return getNodeText(bookmarkNode, "span.js-comment");
    };

    /**
     * ブックマークURLを返す
     * @param bookmarkNode ブックマークアイテムのノード
     * @return ブックマークURL
     */
    const getBookmarkUrl = function (bookmarkNode) {
        return getAttrText(bookmarkNode, "data-target-url");
    };

    /**
     * ブックマークタイトルを返す
     * @param bookmarkNode ブックマークアイテムのノード
     * @return ブックマークタイトル
     */
    const getBookmarkTitle = function (bookmarkNode) {
        return getNodeText(bookmarkNode, "a.js-clickable-link");
    };

    /**
     * ブックマークの説明文を返す
     * @param bookmarkNode ブックマークアイテムのノード
     * @return ブックマークの説明文
     */
    const getBookmarkDescription = function (bookmarkNode) {
        return getNodeText(bookmarkNode, "p.centerarticle-entry-summary");
    };

    /**
     * ブックマークイメージを返す
     * @param bookmarkNode ブックマークアイテムのノード
     * @return ブックマークイメージ
     */
    const getBookmarkImage = async function (bookmarkNode) {
        // OG:imageから取る場合は@connectで*を指定すること
        //const bookmarkUrl = getBookmarkUrl(bookmarkNode);
        //const imageUrl = getOgImage(bookmarkUrl);

        // 通常はサムネ画像を取得
        let imageNode = getNode(bookmarkNode, "a.centerarticle-entry-image img");
        if (!imageNode) {
            // サムネ画像が取得できない場合はfavicon画像を取得
            imageNode = getNode(bookmarkNode, "img.centerarticle-entry-favicon");
        }

        const imageUrl = getAttrText(imageNode, "src");
        const fileName = getFileName(imageUrl);
        const fileType = getFileType(fileName);
        const imageBlob = await getImageBlob(imageUrl);

        return imageBlob;
    };

    /**
     * 画像BLOBデータを返す
     * @param imageUrl 画像URL
     * @return 画像BLOBデータ
     */
    const getImageBlob = async function (imageUrl) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "GET",
                url: imageUrl,
                onload: ({response}) => {
                    const arrayBuffer = response;
                    resolve(arrayBuffer);
                },
                withCredentials: true,
                responseType: 'blob',
            });
        });
    };

    /**
     * OGデータから画像URLを返す
     * @param url OGデータを取得するURL
     * @return 画像URL
     */
    const getOgImage = function (url) {
        const ogData = fetch(url).then(res => res.text()).then(text => {
            const el = new DOMParser().parseFromString(text, "text/html");
            const headEls = (el.head.children);
            Array.from(headEls).map(v => {
                const prop = v.getAttribute('property');
                if (!prop) {
                    return
                };
            });
        });
        return ogData.image ?? "";
    };

    /**
     * ファイル名を返す
     * @param url 対象URL
     * @return ファイル名
     */
    const getFileName = function (url) {
        return url.substring(url.lastIndexOf("/"));
    };

    /**
     * ファイル形式を返す
     * @param fileName ファイル名
     * @return ファイル形式
     */
    const getFileType = function (fileName) {
        const fileExtension = fileName.substring(fileName.indexOf(".")).toLowerCase();
        switch (fileExtension) {
            case "jpg":
            case "jpeg":
                return "image/jpeg";
            default:
                return "image/"+fileExtension;
        }
    };

    /**
     * タグを返す
     * @param baseNode 検索の起点となるタグ
     * @param selectors タグの取得ルール
     * @return タグ
     */
    const getNode = function (baseNode, selectors) {
        return baseNode.querySelector(selectors);
    };

    /**
     * タグの値を返す
     * @param baseNode 検索の起点となるタグ
     * @param selectors タグの取得ルール
     * @return タグの値
     */
    const getNodeText = function (baseNode, selectors) {
         return baseNode.querySelector(selectors).innerText ?? "";
    };

    /**
     * 属性の値を返す
     * @param baseNode 検索の起点となるタグ
     * @param attrName 属性名
     * @return 属性の値
     */
    const getAttrText = function (baseNode, attrName) {
        return baseNode.getAttribute(attrName) ?? "";
    };

    /**
     * Blueskyの接続クラス
     */
    class BlueskyConnect {
        /**
         * コンストラクタ
         * @param bsky_handle ユーザーID
         * @param bsky_app_password アプリパスワード
         * @param bsky_session セッションオブジェクト
         */
        constructor(bsky_handle, bsky_app_password, bsky_session) {
            this._bsky_handle = bsky_handle;
            this._bsky_app_password = bsky_app_password;
            this._session = bsky_session;
        }

        /**
         * ログイン処理
         */
        async login() {
            return new Promise((resolve, reject) => {
                const jsonText = {
                    method: "POST",
                    url: BLUESKY_PDS_URL + '/xrpc/com.atproto.server.createSession',
                    headers: {
                        'Content-Type': 'application/json; charset=UTF-8',
                    },
                    data: JSON.stringify({
                        identifier: this._bsky_handle,
                        password: this._bsky_app_password,
                    }),
                    onload: (response) => {
                        const session = JSON.parse(response.responseText);
                        if (session.error) {
                            reject(session.message);
                        }
                        this._session = session;
                        resolve(session);
                    },
                    onerror: reject,
                };
                GM_xmlhttpRequest(jsonText);
            });
        }

        /**
         * セッションを更新する
         */
        async refresh_session()
        {
            return new Promise((resolve, reject) => {
                const jsonText = {
                    method: "POST",
                    url: BLUESKY_PDS_URL + '/xrpc/com.atproto.server.refreshSession',
                    headers: {
                        'Content-Type': 'application/json; charset=UTF-8',
                        'Authorization': 'Bearer ' + this._session.refreshJwt,
                    },
                    onload: (response) => {
                        const session = JSON.parse(response.responseText);
                        if (session.error) {
                            reject(session.message);
                        }
                        this._session = session;
                        resolve(session);
                    },
                    onerror: reject,
                };
                GM_xmlhttpRequest(jsonText);
            });
        }

        /**
         * セッションを確認する
         */
        async verify_session() {
            if (this._session) {
                try {
                    // 接続済なら更新
                    return await this.refresh_session();
                }
                catch (err) {
                    // 更新に失敗した場合は再ログイン
                    return await this.login();
                }
            }
            else {
                // 切れていたら再ログイン
                return this.login();
            }
        }
    }

    // Your code here...
    const blueskyClient = new BlueskyConnect(BLUESKY_HANDLE, BLUESKY_APP_PASS);
    const bookmarkNodes = document.querySelectorAll("li.bookmark-item");
    const valTargetCss = "div.centerarticle-reaction-meta";

    if (bookmarkNodes) {
        bookmarkNodes.forEach(function(bookmarkNode) {
            // ブックマークアイテム毎に処理
            const iconNode = createBaseIcon(bookmarkNode);
            const node = bookmarkNode.querySelector(valTargetCss);
            node.prepend(iconNode);
        });
    }

})();
