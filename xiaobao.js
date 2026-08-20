
 /**
 * XPTV 扩展插件 - 小宝影院 (xiaobaotv.tv)
 */

const cheerio = createCheerio()
const CryptoJS = createCryptoJS()

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
const BASE_URL = 'https://xiaobaotv.tv'

const DEFAULT_HEADERS = {
    'User-Agent': UA,
    'Referer': BASE_URL,
    'Accept-Language': 'zh-CN,zh;q=0.9'
}

let appConfig = {
    ver: 1,
    title: '小宝影院',
    site: BASE_URL,
    tabs: [
        { name: '电影', ext: { id: '1' } },
        { name: '电视剧', ext: { id: '2' } },
        { name: '综艺', ext: { id: '3' } },
        { name: '动漫', ext: { id: '4' } }
    ]
}

// 1. 获取基础配置[span_1](start_span)[span_1](end_span)
async function getConfig() {
    return jsonify(appConfig)
}

// 2. 获取分类列表卡片[span_2](start_span)[span_2](end_span)
async function getCards(ext) {
    ext = argsify(ext)
    let cards = []
    let { id, page = 1 } = ext
    let url = `${BASE_URL}/index.php/vod/type/id/${id}/page/${page}.html`

    try {
        const { data } = await $fetch.get(url, { headers: DEFAULT_HEADERS })
        const $ = cheerio.load(data)

        $('.module-item').each((i, el) => {
            const $item = $(el)
            const title = $item.find('.module-item-cover .module-item-pic img').attr('alt') || $item.find('.module-item-titlebox').text().trim()
            const href = $item.find('.module-item-cover .module-item-pic a').attr('href') || $item.find('a').attr('href')
            const pic = $item.find('.module-item-cover .module-item-pic img').attr('data-src') || $item.find('img').attr('src')
            const remarks = $item.find('.module-item-text').text().trim()

            if (title && href) {
                cards.push({
                    vod_id: href,
                    vod_name: title,
                    vod_pic: pic && pic.startsWith('//') ? 'https:' + pic : pic,
                    vod_remarks: remarks,
                    ext: { id: href }
                })
            }
        })
    } catch (e) {
        $print(`getCards Error: ${e}`)
    }

    return jsonify({ list: cards })
}

// 3. 获取剧集选集列表[span_3](start_span)[span_3](end_span)
async function getTracks(ext) {
    ext = argsify(ext)
    let id = ext.id
    let detailUrl = id.startsWith('http') ? id : `${BASE_URL}${id}`
    let tracks = []

    try {
        const { data } = await $fetch.get(detailUrl, { headers: DEFAULT_HEADERS })
        const $ = cheerio.load(data)

        $('.module-play-list-content a').each((i, el) => {
            const name = $(el).text().trim()
            const href = $(el).attr('href')
            if (name && href) {
                tracks.push({
                    name: name,
                    pan: '',
                    ext: { playUrl: href }
                })
            }
        })
    } catch (e) {
        $print(`getTracks Error: ${e}`)
    }

    return jsonify({
        list: [
            {
                title: '默认播放源',
                tracks: tracks
            }
        ]
    })
}

// 4. 获取视频直链[span_4](start_span)[span_4](end_span)
async function getPlayinfo(ext) {
    ext = argsify(ext)
    let playUrl = ext.playUrl
    let url = playUrl.startsWith('http') ? playUrl : `${BASE_URL}${playUrl}`
    let realVideoUrl = ''

    try {
        const { data } = await $fetch.get(url, { headers: DEFAULT_HEADERS })

        // 提取 var player_aaaa 或 player_data[span_5](start_span)[span_5](end_span)
        const match = data.match(/var\s+(?:player_aaaa|player_data)\s*=\s*(\{.*?\});/)
        if (match && match[1]) {
            const playConfig = argsify(match[1])
            let rawUrl = playConfig.url

            if (rawUrl) {
                // 如果遭遇 Base64 编码，进行自动解码[span_6](start_span)[span_6](end_span)
                if (!rawUrl.startsWith('http') && !rawUrl.includes('.m3u8')) {
                    try {
                        rawUrl = decodeURIComponent(atob(rawUrl))
                    } catch (e) {
                        $print(`Base64 Decode Error: ${e}`)
                    }
                }

                if (rawUrl.startsWith('//')) {
                    rawUrl = 'https:' + rawUrl
                }
                realVideoUrl = rawUrl
            }
        }

        // 备用解析：如果内嵌了 iframe Parsing 接口
        if (!realVideoUrl) {
            const $ = cheerio.load(data)
            const iframeSrc = $('iframe').attr('src')
            if (iframeSrc && iframeSrc.includes('url=')) {
                realVideoUrl = decodeURIComponent(iframeSrc.split('url=')[1].split('&')[0])
            }
        }
    } catch (e) {
        $print(`getPlayinfo Error: ${e}`)
    }

    return jsonify({
        urls: [realVideoUrl],
        headers: {
            'User-Agent': UA,
            'Referer': BASE_URL
        }
    })
}

// 5. 搜索功能[span_7](start_span)[span_7](end_span)
async function search(ext) {
    ext = argsify(ext)
    let text = encodeURIComponent(ext.text)
    let page = ext.page || 1
    let url = `${BASE_URL}/index.php/vod/search/page/${page}/wd/${text}.html`
    let cards = []

    try {
        const { data } = await $fetch.get(url, { headers: DEFAULT_HEADERS })
        const $ = cheerio.load(data)

        $('.module-search-item, .module-item').each((i, el) => {
            const $item = $(el)
            const title = $item.find('.module-card-item-title, .module-item-titlebox').text().trim() || $item.find('img').attr('alt')
            const href = $item.find('a').attr('href')
            const pic = $item.find('img').attr('data-src') || $item.find('img').attr('src')
            const remarks = $item.find('.module-item-text, .video-serial').text().trim()

            if (title && href) {
                cards.push({
                    vod_id: href,
                    vod_name: title,
                    vod_pic: pic && pic.startsWith('//') ? 'https:' + pic : pic,
                    vod_remarks: remarks,
                    ext: { id: href }
                })
            }
        })
    } catch (e) {
        $print(`search Error: ${e}`)
    }

    return jsonify({ list: cards })
}