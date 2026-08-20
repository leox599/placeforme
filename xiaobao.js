/**
 * XPTV 扩展插件 - 小宝影院 (xiaobaotv.tv)
 * 适配模板：MYTheme
 */

const cheerio = createCheerio()

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
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
        { name: '电影', ext: { id: '1' } },
        { name: '电视剧', ext: { id: '2' } },
        { name: '综艺', ext: { id: '3' } },
        { name: '动漫', ext: { id: '4' } },
        { name: '短剧', ext: { id: '5' } }
    ]
}

// 1. 配置入口
async function getConfig() {
    return jsonify(appConfig)
}

// 2. 获取分类列表
async function getCards(ext) {
    ext = argsify(ext)
    let cards = []
    let { id, page = 1 } = ext
    let url = `${BASE_URL}/movie/type/${id}.html`
    if (page > 1) {
        url = `${BASE_URL}/movie/type/${id}/page/${page}.html`
    }

    try {
        const { data } = await $fetch.get(url, { headers: DEFAULT_HEADERS })
        const $ = cheerio.load(data)

        $('.myui-vodlist li, .myui-vodlist__media li').each((i, el) => {
            const $item = $(el)
            const $a = $item.find('a.myui-vodlist__thumb, .detail .title a').first()
            const title = $a.attr('title') || $item.find('.title a').text().trim()
            const href = $a.attr('href')
            const pic = $item.find('.myui-vodlist__thumb').attr('data-original') || $item.find('img').attr('src')
            const remarks = $item.find('.pic-text').text().trim() || $item.find('.text-muted').text().trim()

            if (title && href) {
                cards.push({
                    vod_id: href,
                    vod_name: title,
                    vod_pic: pic && pic.startsWith('/') ? BASE_URL + pic : pic,
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

// 3. 获取选集列表
async function getTracks(ext) {
    ext = argsify(ext)
    let id = ext.id
    let detailUrl = id.startsWith('http') ? id : `${BASE_URL}${id}`
    let tracks = []

    try {
        const { data } = await $fetch.get(detailUrl, { headers: DEFAULT_HEADERS })
        const $ = cheerio.load(data)

        // MYTheme 常见的播放列表容器
        $('.myui-content__list li a, .playlist li a').each((i, el) => {
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

        // 如果详情页直接提供了“立即播放”按钮，提取默认播放入口
        if (tracks.length === 0) {
            const playBtn = $('a.btn-warm').attr('href')
            if (playBtn) {
                tracks.push({
                    name: '播放正片',
                    pan: '',
                    ext: { playUrl: playBtn }
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
                tracks: tracks
            }
        ]
    })
}

// 4. 获取播放直链
async function getPlayinfo(ext) {
    ext = argsify(ext)
    let playUrl = ext.playUrl
    let url = playUrl.startsWith('http') ? playUrl : `${BASE_URL}${playUrl}`
    let realVideoUrl = ''

    try {
        const { data } = await $fetch.get(url, { headers: DEFAULT_HEADERS })

        // 1. 匹配 maccms 变量（maccms/player_aaaa/player_data）
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
                if (rawUrl.startsWith('//')) {
                    rawUrl = 'https:' + rawUrl
                }
                realVideoUrl = rawUrl
            }
        }

        // 2. MYTheme 模版备用：寻找 iframe
        if (!realVideoUrl) {
            const $ = cheerio.load(data)
            const iframeSrc = $('iframe').attr('src')
            if (iframeSrc) {
                if (iframeSrc.includes('url=')) {
                    realVideoUrl = decodeURIComponent(iframeSrc.split('url=')[1].split('&')[0])
                } else if (iframeSrc.startsWith('http') || iframeSrc.startsWith('//')) {
                    realVideoUrl = iframeSrc.startsWith('//') ? 'https:' + iframeSrc : iframeSrc
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
            'Referer': BASE_URL + '/'
        }
    })
}

// 5. 搜索功能（精准适配你提供的搜索 HTML 选择器）
async function search(ext) {
    ext = argsify(ext)
    let text = encodeURIComponent(ext.text)
    let url = `${BASE_URL}/search/wd/${text}.html`
    let cards = []

    try {
        const { data } = await $fetch.get(url, { headers: DEFAULT_HEADERS })
        const $ = cheerio.load(data)

        // 精准匹配源码中的 #searchList li 容器
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
                    vod_pic: pic && pic.startsWith('/') ? BASE_URL + pic : pic,
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
