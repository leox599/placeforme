/**
 * XPTV 扩展插件 - 小宝影院 (xiaobaotv.tv)
 * 适配标准: XPTV JS API
 */

const cheerio = createCheerio()

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
const BASE_URL = 'https://www.xiaobaotv.tv'

const DEFAULT_HEADERS = {
    'User-Agent': UA,
    'Referer': BASE_URL + '/',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
}

// 1. 首页与分类配置 [XPTV 规范: home()]
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

// 2. 分类列表 [XPTV 规范: category(tid, pg, filter, extend)]
async function category(tid, pg = 1, filter, extend) {
    let url = `${BASE_URL}/movie/type/${tid}.html`
    if (parseInt(pg) > 1) {
        url = `${BASE_URL}/movie/type/${tid}/page/${pg}.html`
    }

    let cards = []
    try {
        const { data } = await $fetch.get(url, { headers: DEFAULT_HEADERS })
        const $ = cheerio.load(data)

        $('.myui-vodlist li, .myui-vodlist__media li').each((i, el) => {
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
                    vod_pic: pic && pic.startsWith('/') ? BASE_URL + pic : pic,
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

// 3. 详情与选集 [XPTV 规范: detail(id)]
async function detail(id) {
    let detailUrl = id.startsWith('http') ? id : `${BASE_URL}${id}`
    let playFrom = []
    let playList = []

    try {
        const { data } = await $fetch.get(detailUrl, { headers: DEFAULT_HEADERS })
        const $ = cheerio.load(data)

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
                tracks.push(`立即播放$${playBtn}`)
            }
        }

        playFrom.push('小宝影院')
        playList.push(tracks.join('#'))

        const vod = {
            vod_id: id,
            vod_name: $('.myui-content__detail .title').text().trim() || $('title').text().split('-')[0].trim(),
            vod_pic: $('.myui-content__thumb .lazyload').attr('data-original'),
            vod_play_from: playFrom.join('$$$'),
            vod_play_url: playList.join('$$$')
        }

        return jsonify({ list: [vod] })
    } catch (e) {
        $print(`detail Error: ${e}`)
        return jsonify({ list: [] })
    }
}

// 4. 获取播放直链 [XPTV 规范: play(flag, id, flags)]
async function play(flag, id, flags) {
    let url = id.startsWith('http') ? id : `${BASE_URL}${id}`
    let realVideoUrl = ''

    try {
        const { data } = await $fetch.get(url, { headers: DEFAULT_HEADERS })

        // 提取 player_aaaa / player_data 变量
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

        // 备用抓取 iframe 接口
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

// 5. 搜索功能 [XPTV 规范: search(key, quick, pg)]
async function search(key, quick, pg = 1) {
    let text = encodeURIComponent(key)
    let url = `${BASE_URL}/search/wd/${text}.html`
    let cards = []

    try {
        const { data } = await $fetch.get(url, { headers: DEFAULT_HEADERS })
        const $ = cheerio.load(data)

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
                    vod_remarks: remarks
                })
            }
        })
    } catch (e) {
        $print(`search Error: ${e}`)
    }

    return jsonify({ list: cards })
}
