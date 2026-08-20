/**
 * XPTV 扩展插件 - 小宝影院 (xiaobaotv.tv)
 */

const cheerio = createCheerio()

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
const BASE_URL = 'https://www.xiaobaotv.tv'

const HEADERS = {
    'User-Agent': UA,
    'Referer': BASE_URL + '/',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
}

function fixUrl(url) {
    if (!url) return ''
    if (url.startsWith('http://') || url.startsWith('https://')) return url
    if (url.startsWith('//')) return 'https:' + url
    if (url.startsWith('/')) return BASE_URL + url
    return BASE_URL + '/' + url
}

// 1. 首页与分类
async function home() {
    return jsonify({
        class: [
            { type_id: '1', type_name: '电影' },
            { type_id: '2', type_name: '电视剧' },
            { type_id: '3', type_name: '综艺' },
            { type_id: '4', type_name: '动漫' },
            { type_id: '5', type_name: '短剧' }
        ]
    })
}

// 2. 分类列表
async function category(tid, pg = 1, filter, extend) {
    let url = (parseInt(pg) > 1) ? `${BASE_URL}/movie/type/${tid}/page/${pg}.html` : `${BASE_URL}/movie/type/${tid}.html`
    let cards = []

    try {
        const res = await $fetch.get(url, { headers: HEADERS })
        const $ = cheerio.load(res.data || '')

        $('.myui-vodlist li, #searchList li').each((i, el) => {
            const $item = $(el)
            const $a = $item.find('a.myui-vodlist__thumb, .detail .title a').first()
            const title = $a.attr('title') || $item.find('.title a').text().trim()
            const href = $a.attr('href')
            const pic = $item.find('.myui-vodlist__thumb').attr('data-original') || $item.find('img').attr('src')
            const remarks = $item.find('.pic-text').text().trim()

            if (title && href) {
                cards.push({
                    vod_id: href,
                    vod_name: title,
                    vod_pic: fixUrl(pic),
                    vod_remarks: remarks
                })
            }
        })
    } catch (e) {
        $print(`category Error: ${e}`)
    }

    return jsonify({
        page: parseInt(pg),
        pagecount: 99,
        limit: cards.length,
        total: 999,
        list: cards
    })
}

// 3. 详情与剧集
async function detail(id) {
    let detailUrl = fixUrl(id)
    let playFrom = []
    let playList = []

    try {
        const res = await $fetch.get(detailUrl, { headers: HEADERS })
        const $ = cheerio.load(res.data || '')

        let tracks = []
        $('.myui-content__list li a, .playlist li a').each((i, el) => {
            const name = $(el).text().trim()
            const href = $(el).attr('href')
            if (name && href) {
                tracks.push(`${name}$${href}`)
            }
        })

        if (tracks.length === 0) {
            const playBtn = $('a.btn-warm').attr('href')
            if (playBtn) {
                tracks.push(`播放正片$${playBtn}`)
            }
        }

        playFrom.push('小宝专线')
        playList.push(tracks.join('#'))

        const vod = {
            vod_id: id,
            vod_name: $('.myui-content__detail .title').text().trim() || '未知',
            vod_pic: fixUrl($('.myui-content__thumb .lazyload').attr('data-original')),
            vod_play_from: playFrom.join('$$$'),
            vod_play_url: playList.join('$$$')
        }

        return jsonify({ list: [vod] })
    } catch (e) {
        $print(`detail Error: ${e}`)
        return jsonify({ list: [] })
    }
}

// 4. 获取播放地址
async function play(flag, id, flags) {
    let url = fixUrl(id)
    let realVideoUrl = ''

    try {
        const res = await $fetch.get(url, { headers: HEADERS })
        const html = res.data || ''

        // 提取播放器脚本配置
        const match = html.match(/var\s+(?:player_aaaa|player_data)\s*=\s*(\{.*?\});/)
        if (match && match[1]) {
            const playConfig = argsify(match[1])
            let rawUrl = playConfig.url

            if (rawUrl) {
                if (!rawUrl.startsWith('http') && !rawUrl.includes('.m3u8')) {
                    try {
                        rawUrl = decodeURIComponent(atob(rawUrl))
                    } catch (e) {}
                }
                realVideoUrl = fixUrl(rawUrl)
            }
        }

        // iframe 备用提取
        if (!realVideoUrl) {
            const $ = cheerio.load(html)
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
        $print(`play Error: ${e}`)
    }

    return jsonify({
        parse: 0,
        url: realVideoUrl,
        header: {
            'User-Agent': UA,
            'Referer': BASE_URL + '/'
        }
    })
}

// 5. 搜索
async function search(key, quick, pg = 1) {
    let text = encodeURIComponent(key)
    let url = `${BASE_URL}/search/wd/${text}.html`
    let cards = []

    try {
        const res = await $fetch.get(url, { headers: HEADERS })
        const $ = cheerio.load(res.data || '')

        $('#searchList li, .myui-vodlist__media li').each((i, el) => {
            const $item = $(el)
            const title = $item.find('.detail .title a').text().trim() || $item.find('h4.title a').text().trim()
            const href = $item.find('.detail .title a').attr('href') || $item.find('.thumb a').attr('href')
            const pic = $item.find('.myui-vodlist__thumb').attr('data-original')
            const remarks = $item.find('.pic-text').text().trim()

            if (title && href) {
                cards.push({
                    vod_id: href,
                    vod_name: title,
                    vod_pic: fixUrl(pic),
                    vod_remarks: remarks
                })
            }
        })
    } catch (e) {
        $print(`search Error: ${e}`)
    }

    return jsonify({ list: cards })
}
