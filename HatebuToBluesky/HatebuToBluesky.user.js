// ==UserScript==
// @name         hatebuToBluesky
// @namespace    http://tampermonkey.net/snow113/hatebuToBluesky/
// @version      2024-02-18
// @updateURL    https://github.com/snow113-gt/userscript/blob/master/HatebuToBluesky/HatebuToBluesky.user.js
// @description  はてなブックマークのブックマーク内容をBlueskyに投稿するユーザースクリプト
// @author       snow113
// @match        https://b.hatena.ne.jp/%はてなのユーザーID%/bookmark*
// @icon         https://bsky.app/static/favicon-16x16.png
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      bsky.social
// @connect      cdn-ak-scissors.b.st-hatena.com
// @connect      cdn-ak2.favicon.st-hatena.com
// ==/UserScript==

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

(function() {
    'use strict';
    const varBookmarkBaseCss = "li.bookmark-item";
    const valTargetCss = "div.centerarticle-reaction-meta";

    // Your code here...
    var bookmarkNodes = document.querySelectorAll(varBookmarkBaseCss);
    if (bookmarkNodes) {
        bookmarkNodes.forEach(function(bookmarkNode) {
            // ブックマークアイテム毎に処理
            var iconNode = createBaseIcon(bookmarkNode);
            const node = bookmarkNode.querySelector(valTargetCss);
            node.prepend(iconNode);
        });
    }
})();

/**
 * Blueskyへの投稿機能を付与したノードを作成して返す
 * @param bookmarkNode ブックマークアイテムのノード
 * @return 投稿用ノード
 */
function createBaseIcon(bookmarkNode) {
    var buttonNode = document.createElement("input");
    buttonNode.setAttribute("type","image");
    buttonNode.setAttribute("src", BUTTON_IMAGE);
    buttonNode.addEventListener("click", ()=> {return postBluesky(bookmarkNode); }, false);

    return buttonNode;
}

/**
 * Blueskyに投稿する
 * @param bookmarkNode ブックマークアイテムのノード
 * @return 実行結果
 */
async function postBluesky(bookmarkNode) {
    try {
        let client = new BlueskyConnect(BLUESKY_HANDLE, BLUESKY_APP_PASS);
        await client.verify_session()
            .then((session) => {
            if (session.error)
            {
                throw new Error(session.message);
            }
            GM_setValue('bsky_session', session);
        });

        let postData = {};
        try {
            postData = await createBookmarkPostData(bookmarkNode);
        } catch (error) {
            // リンクカード形式にできない時は通常のテキストとして投稿
            console.log("リンクカードの生成に失敗："+error);
            postData = createTextPostData(bookmarkNode);
        }

        if (confirm("ブックマーク「"+JSON.stringify(postData.text)+"」をBlueskyに投稿します")) {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: "POST",
                    url: BLUESKY_PDS_URL + '/xrpc/com.atproto.repo.createRecord',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + client._session.accessJwt,
                    },
                    fetch: true,
                    data: JSON.stringify({
                        repo: client._session.did,
                        collection: 'app.bsky.feed.post',
                        record: postData,
                    }),
                    onload: ({response}) => {
                        if (response.OK) {
                            resolve(response);
                        }
                        else {
                            window.alert('Blueskyへの投稿に失敗しました');
                            reject(response);
                        }
                    },
                    withCredentials: true,
                    responseType: 'json',
                });
            });
        }
        return Promise.reject();
    }
    catch (e) {
        console.log(e);
    }
}

/**
 * BlueskyのPDSにBLOBデータを投稿する
 * @param postBlobData BLOBデータ
 * @return 実行結果
 */
async function postBlobData(postBlobData) {
    try {
        let client = new BlueskyConnect(BLUESKY_HANDLE, BLUESKY_APP_PASS);
        await client.verify_session()
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
                    'Authorization': 'Bearer ' + client._session.accessJwt,
                },
                fetch: true,
                data: postBlobData,
                onload: ({response}) => {
                    if (response.OK) {
                        resolve(response);
                    }
                    else {
                        console.log('BLOBアップロードに失敗しました');
                        reject(response);
                    }
                },
                withCredentials: true,
                responseType: 'json',
            });
        });
    }
    catch (e) {
        console.log(e);
    }
}

/**
 * ブックマーク投稿用データを作成して返す
 * @param bookmarkNode ブックマークアイテムのノード
 * @return ブックマーク投稿用データ
 */
async function createBookmarkPostData(bookmarkNode) {
    const postComment = getBaseComment(bookmarkNode);
    const now = (new Date()).toISOString();
    const linkUrl = getBookmarkUrl(bookmarkNode);
    const linkText = getBookmarkTitle(bookmarkNode);
    const linkDescription = getBookmarkDescription(bookmarkNode);
    const imageData = await getBookmarkImage(bookmarkNode);

    // 画像をPDSに投稿
    const blobData = await postBlobData(imageData).blob;

    return {
        'text': postComment,
        'createdAt': now,
        'embed': {
            '$type': 'app.bsky.embed.external',
            'external': {
                'uri': linkUrl,
                'title': linkText,
                'description': linkDescription,
                'thumb': blobData,
            },
        },
    };
}

/**
 * テキスト投稿用データを作成して返す
 * @param bookmarkNode ブックマークアイテムのノード
 * @return 投稿用データ
 */
function createTextPostData(bookmarkNode) {
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
}

/**
 * 投稿用リッチテキストデータを作成して返す
 * @param comment コメント
 * @param linkText リンクテキスト
 * @param linkUrl リンクURL
 * @return 投稿用リッチテキストデータ
 */
function createPostFacets(comment, linkText, linkUrl) {
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
}

/**
 * 投稿用コメントを返す
 * @param bookmarkNode ブックマークアイテムのノード
 * @return 投稿用コメント
 */
function getBaseComment(bookmarkNode) {
    const bkTags = getBookmarkTags(bookmarkNode);
    const bkComments = getBookmarkComments(bookmarkNode);

    return COMMENT_PREFIX+bkTags+" "+bkComments+" ";
}

/**
 * ブックマークタグを返す
 * @param bookmarkNode ブックマークアイテムのノード
 * @return ブックマークタグ
 */
function getBookmarkTags(bookmarkNode) {
    let text = getNodeText(bookmarkNode, "ul.centerarticle-reaction-tags");
    if (text) {
        return "["+text.replaceAll(" ","][")+"]";
    }
    return "";
}

/**
 * ブックマークコメントを返す
 * @param bookmarkNode ブックマークアイテムのノード
 * @return ブックマークコメント
 */
function getBookmarkComments(bookmarkNode) {
    return getNodeText(bookmarkNode, "span.js-comment");
}

/**
 * ブックマークURLを返す
 * @param bookmarkNode ブックマークアイテムのノード
 * @return ブックマークURL
 */
function getBookmarkUrl(bookmarkNode) {
    return getAttrText(bookmarkNode, "data-target-url");
}

/**
 * ブックマークタイトルを返す
 * @param bookmarkNode ブックマークアイテムのノード
 * @return ブックマークタイトル
 */
function getBookmarkTitle(bookmarkNode) {
    return getNodeText(bookmarkNode, "a.js-clickable-link");
}

/**
 * ブックマークの説明文を返す
 * @param bookmarkNode ブックマークアイテムのノード
 * @return ブックマークの説明文
 */
function getBookmarkDescription(bookmarkNode) {
    return getNodeText(bookmarkNode, "p.centerarticle-entry-summary");
}

/**
 * ブックマークイメージを返す
 * @param bookmarkNode ブックマークアイテムのノード
 * @return ブックマークイメージ
 */
async function getBookmarkImage(bookmarkNode) {
    // OG:imageから取る場合は@connectで*を指定すること
    //const bookmarkUrl = getBookmarkUrl(bookmarkNode);
    //const imageUrl = getOgImage(bookmarkUrl);

    // 通常はサムネ画像を取得
    let imageNode = getNodeImage(bookmarkNode, "a.centerarticle-entry-image img");
    if (!imageNode) {
        // サムネ画像が取得できない場合はfavicon画像を取得
        imageNode = getNodeImage(bookmarkNode, "img.centerarticle-entry-favicon");
    }

    const imageUrl = getAttrText(imageNode, "src");
    const fileName = getFileName(imageUrl);
    const fileType = getFileType(fileName);
    const imageBlob = await getImageBlob(imageUrl);

    return imageBlob;
}

/**
 * 画像BLOBデータを返す
 * @param imageUrl 画像URL
 * @return 画像BLOBデータ
 */
async function getImageBlob(imageUrl) {
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
}

/**
 * OGデータから画像URLを返す
 * @param url OGデータを取得するURL
 * @return 画像URL
 */
function getOgImage(url) {
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
    return (ogData ? "" : ogData.image) ?? "";
}

/**
 * ファイル名を返す
 * @param url 対象URL
 * @return ファイル名
 */
function getFileName(url) {
    return url.substring(url.lastIndexOf("/"));
}

/**
 * ファイル形式を返す
 * @param fileName ファイル名
 * @return ファイル形式
 */
function getFileType(fileName) {
    const fileExtension = fileName.substring(fileName.indexOf(".")).toLowerCase();
    switch (fileExtension) {
        case "jpg":
        case "jpeg":
            return "image/jpeg";
        case "png":
            return "image/png";
        case "gif":
            return "image/gif";
        default:
            return "";
    }
}

/**
 * タグを返す
 * @param baseNode ノード
 * @param selectors タグの取得ルール
 * @return タグの値
 */
function getNodeImage(baseNode, selectors) {
    const node = baseNode.querySelector(selectors);
    if (node) {
        return node;
    }
    return null;
}

/**
 * タグの値を返す
 * @param baseNode ノード
 * @param selectors タグの取得ルール
 * @return タグの値
 */
function getNodeText(baseNode, selectors) {
    const node = baseNode.querySelector(selectors);
    if (node) {
        return node.innerText;
    }
    return null;
}

/**
 * 属性の値を返す
 * @param baseNode ノード
 * @param attrName 属性名
 * @return 属性の値
 */
function getAttrText(baseNode, attrName) {
    const node = baseNode.getAttribute(attrName);
    if (node) {
        return node;
    }
    return null;
}

/**
 * Blueskyの接続クラス
 * via: https://greasyfork.org/ja/scripts/478614-twitter-to-bsky/code
 */
class BlueskyConnect
{
    // All parameters are optional
    constructor(bsky_handle, bsky_app_password, bsky_session)
    {
        this._bsky_handle = bsky_handle;
        this._bsky_app_password = bsky_app_password;
        this._session = bsky_session;
    }

    set_credentials(bsky_handle, bsky_app_password)
    {
        this._bsky_handle = bsky_handle;
        this._bsky_app_password = bsky_app_password;
        this._session = null;
    }

    async login()
    {
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
                    if (session.error)
                    {
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
                    if (session.error)
                    {
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

    // Utility function
    async verify_session()
    {
        if (this._session)
        {
            try
            {
                return await this.refresh_session();
            } catch (err)
            {
                return await this.login();
            }
        }
        else
        {
            return this.login();
        }
    }
}
