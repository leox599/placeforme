/**
 * XPTV 扩展插件 - 一帆视频 (yifan.tv)
 */

// 1. 全局配置与请求头
const BASE_URL = 'https://www.yifan.tv';
const DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    'Referer': BASE_URL,
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
};

const cheerio = createCheerio();

/**
 * 提取 m3u8 或真实播放链接
 * @param {string} flag - 播放源标识
 * @param {string} id - 播放页路径 (例: /vodplay/123-1-1.html)
 */
async function play(flag, id) {
    try {
        const playUrl = id.startsWith('http') ? id : `${BASE_URL}${id}`;
        const { data } = await $fetch.get(playUrl, { headers: DEFAULT_HEADERS });
        
        // 1. 尝试从 MacPlayer / CMS 常见的 var player_aaaa / player_data 提取 JSON
        const playerMatch = data.match(/var\s+(?:player_aaaa|player_data)\s*=\s*(\{.*?\});/);
        
        if (playerMatch && playerMatch[1]) {
            const playConfig = argsify(playerMatch[1]);
            let videoUrl = playConfig.url;
            
            if (videoUrl) {
                // 如果地址是 Base64 加密的则进行解码
                if (!videoUrl.startsWith('http') && !videoUrl.includes('.m3u8')) {
                    try {
                        videoUrl = decodeURIComponent(atob(videoUrl));
                    } catch (e) {
                        $print(`Base64 解码跳过: ${e}`);
                    }
                }

                // 补全 URL 路径
                if (videoUrl.startsWith('//')) {
                    videoUrl = 'https:' + videoUrl;
                }

                return {
                    parse: 0, // 0 代表直接播放（m3u8/mp4），不需要二次 Parse
                    url: videoUrl,
                    header: {
                        'User-Agent': DEFAULT_HEADERS['User-Agent'],
                        'Referer': BASE_URL
                    }
                };
            }
        }

        // 2. 备用方案：通过 cheerio 提取 iframe 内部地址
        const $ = cheerio.load(data);
        const iframeSrc = $('iframe').attr('src');
        if (iframeSrc && iframeSrc.includes('url=')) {
            const realUrl = decodeURIComponent(iframeSrc.split('url=')[1].split('&')[0]);
            return {
                parse: 0,
                url: realUrl,
                header: { 'User-Agent': DEFAULT_HEADERS['User-Agent'] }
            };
        }

        $utils.toastError('未能成功解析到可播放视频流');
        return null;
    } catch (error) {
        $print(`Play Error: ${error}`);
        $utils.toastError('播放异常');
        return null;
    }
}

/**
 * 获取首页推荐列表 (XPTV 必备入口)
 */
async function home() {
    try {
        const { data } = await $fetch.get(BASE_URL, { headers: DEFAULT_HEADERS });
        const $ = cheerio.load(data);
        const list = [];

        $('.vodlist__thumb, .module-item-pic').each((i, el) => {
            const title = $(el).attr('title') || $(el).find('img').attr('alt');
            const href = $(el).attr('href');
            const pic = $(el).attr('data-original') || $(el).find('img').attr('src') || $(el).attr('src');

            if (title && href) {
                list.push({
                    vod_id: href,
                    vod_name: title,
                    vod_pic: pic && pic.startsWith('//') ? 'https:' + pic : pic,
                    vod_remarks: $(el).find('.pic-text, .module-item-text').text() || ''
                });
            }
        });

        return { list };
    } catch (error) {
        $print(`Home Error: ${error}`);
        return { list: [] };
    }
}

/**
 * 详情页获取及剧集选集提取
 */
async function detail(id) {
    try {
        const detailUrl = id.startsWith('http') ? id : `${BASE_URL}${id}`;
        const { data } = await $fetch.get(detailUrl, { headers: DEFAULT_HEADERS });
        const $ = cheerio.load(data);

        const playUrls = [];
        // 匹配剧集列表选择器
        $('.playlist_full li a, .module-play-list-link').each((i, el) => {
            const name = $(el).text().trim();
            const href = $(el).attr('href');
            if (name && href) {
                playUrls.push(`${name}$${href}`);
            }
        });

        const vod = {
            vod_id: id,
            vod_name: $('.page-title, .module-info-heading h1').text().trim(),
            vod_pic: $('.vodlist__thumb').attr('data-original') || '',
            vod_content: $('.vod_content, .video-info-content').text().trim(),
            vod_play_from: '一帆专线',
            vod_play_url: playUrls.join('#')
        };

        return { list: [vod] };
    } catch (error) {
        $print(`Detail Error: ${error}`);
        return { list: [] };
    }
}
