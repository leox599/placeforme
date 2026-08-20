/**
 * XPTV 扩展插件 - 小宝影院 (xiaobaotv.tv)
 */

const cheerio = createCheerio()
const CryptoJS = createCryptoJS()

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.3'
const BASE_URL = 'https://www.xiaobaotv.tv'

const DEFAULT_HEADERS = {
    'User-Agent': UA,
    'Referer': BASE_URL + '/',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
}

let appConfig = {
    ver: 1,
    title: '小宝影院',
    site: BASE_URL,
    tabs: [
        {
            name: '电影',
            ext: {
                id: '1',
            },
        },
        {
            name: '电视剧',
            ext: {
                id: '2',
            },
        },
        {
            name: '综艺',
            ext: {
                id: '3',
            },
        },
        {
            name: '动漫',
            ext: {
                id: '4',
            },
        },
        {
            name: '短剧',
            ext: {
                id: '5',
            },
        },
    ],
}

function fixUrl(url) {
    if (!url) return ''
    if (url.startsWith('http://') || url.startsWith('https://')) return url
    if (url.startsWith('//')) return 'https:' + url
    if (url.startsWith('/')) return BASE_URL + url
    return BASE_URL + '/' + url
}

// 1. 获取配置
async function getConfig() {
    return jsonify(appConfig)
}

// 2. 获取分类列表
async function getCards(ext) {
    ext = argsify(ext)
    let cards = []
    let { id, page = 1 } = ext
    let url = (parseInt(page) > 1) ? `${BASE_URL}/movie/type/${id}/page/${page}.html` : `${BASE_URL}/movie/type/${id}.html`

    try {
        const { data } = await $fetch.get(url, { headers: DEFAULT_HEADERS })
        const $ = cheerio.load(data)

        $('.myui-vodlist li').each((i, el) => {
            const $item = $(el)
            const $a = $item.find('a.myui-vodlist__thumb').first()
            const title = $a.attr('title') || $item.find('.title a').text().trim()
            const href = $a.attr('href')
            const pic = $a.attr('data-original') || $item.find('img').attr('src')
            const remarks = $item.find('.pic-text').text().trim()

            if (title && href) {
                cards.push({
                    vod_id: href,
                    vod_name: title,
                    vod_pic: fixUrl(pic),
                    vod_remarks: remarks,
                    ext: {
                        href: href,
                    },
                })
            }
        })
    } catch (e) {
        $print(`getCards Error: ${e}`)
    }

    return jsonify({
        list: cards,
    })
}

// 3. 获取剧集选集
async function getTracks(ext) {
    ext = argsify(ext)
    let href = ext.href
    let detailUrl = fixUrl(href)
    let tracks = []

    try {
        const { data } = await $fetch.get(detailUrl, { headers: DEFAULT_HEADERS })
        const $ = cheerio.load(data)

        $('.myui-content__list li a, .playlist li a').each((i, el) => {
            const name = $(el).text().trim()
            const playHref = $(el).attr('href')
            if (name && playHref) {
                tracks.push({
                    name: name,
                    pan: '',
                    ext: {
                        playUrl: playHref,
                    },
                })
            }
        })

        if (tracks.length === 0) {
            const playBtn = $('a.btn-warm').attr('href')
            if (playBtn) {
                tracks.push({
                    name: '立即播放',
                    pan: '',
                    ext: {
                        playUrl: playBtn,
                    },
                })
            }
        }
    } catch (e) {
        $print(`getTracks Error: ${e}`)
    }

    return jsonify({
        list: [
            {
                title: '默认线路',
                tracks: tracks,
            },
        ],
    })
}

// 4. 获取播放直链
async function getPlayinfo(ext) {
    ext = argsify(ext)
    let playUrl = ext.playUrl
    let url = fixUrl(playUrl)
    let realVideoUrl = ''

    try {
        const { data } = await $fetch.get(url, { headers: DEFAULT_HEADERS })

        // 提取 var player_aaaa 或 player_data 变量
        const match = data.match(/var\s+(?:player_aaaa|player_data)\s*=\s*(\{.*?\});/)
        if (match && match[1]) {
            const playConfig = argsify(match[1])
            let rawUrl = playConfig.url

            if (rawUrl) {
                if (!rawUrl.startsWith('http') && !rawUrl.includes('.m3u8')) {
                    try {
                        rawUrl = decodeURIComponent(atob(rawUrl))
                    } catch (e) {
                        $print(`Base64 Decode Error: ${e}`)
                    }
                }
                realVideoUrl = fixUrl(rawUrl)
            }
        }

        // 备用：查找 iframe 播放器
        if (!realVideoUrl) {
            const $ = cheerio.load(data)
            const iframeSrc = $('iframe').attr('src')
            if (iframeSrc) {
                if (iframeSrc.includes('url=')) {
                    realVideoUrl = decodeURIComponent(iframeSrc.split('url=')[1].split('&')[0])
                } else {
                    realVideoUrl = fixUrl(iframeSrc)
                }
            }
        }
    } catch (e) {
        $print(`getPlayinfo Error: ${e}`)
    }

    return jsonify({
        urls: [realVideoUrl],
        headers: {
            'User-Agent': UA,
            'Referer': BASE_URL + '/',
        },
    })
}

// 5. 搜索功能
async function search(ext) {
    ext = argsify(ext)
    let cards = []
    const text = encodeURIComponent(ext.text)
    const url = `${BASE_URL}/search/wd/${text}.html`

    try {
        const { data } = await $fetch.get(url, { headers: DEFAULT_HEADERS })
        const $ = cheerio.load(data)

        // 针对刚才提供的小宝真实 HTML 中的 #searchList li 容器提取
        $('#searchList li').each((i, el) => {
            const $item = $(el)
            const title = $item.find('.detail .title a').text().trim()
            const href = $item.find('.detail .title a').attr('href') || $item.find('.thumb a').attr('href')
            const pic = $item.find('.myui-vodlist__thumb').attr('data-original')
            const remarks = $item.find('.pic-text').text().trim()

            if (title && href) {
                cards.push({
                    vod_id: href,
                    vod_name: title,
                    vod_pic: fixUrl(pic),
                    vod_remarks: remarks,
                    ext: {
                        href: href,
                    },
                })
            }
        })
    } catch (e) {
        $print(`search Error: ${e}`)
    }

    return jsonify({
        list: cards,
    })
}
