const fetch = (url, init) => import('node-fetch').then(module => module.default(url, init));
const path = require('path');
const fs = require('fs');
const https = require('https');
//https://github.com/copilot/c/ac6e5e81-8992-40b9-b5e8-484f0447e745

const updateContentJson = async () => {
    try {
        // 请求原网站获取HTML
        const htmlResponse = await fetch('https://nymey.com/geo-restriction/', {
            agent: new https.Agent({
                rejectUnauthorized: false
            })
        });
        const html = await htmlResponse.text();
        const tokenMatch = html.match(/localStorage.setItem\('access_token', "([^"]+)/);
        const accessToken = tokenMatch ? tokenMatch[1] : null;

        if (!accessToken) {
            console.error('Failed to retrieve access token');
            return;
        }

        // 读取现有的 content.json 文件
        const existingDataPath = path.join(__dirname, './html/content.json');
        let existingUrls = new Set();
        let existingData = [];

        if (fs.existsSync(existingDataPath)) {
            const existingDataContent = fs.readFileSync(existingDataPath, 'utf-8');
            existingData = JSON.parse(existingDataContent);
            existingUrls = new Set(existingData.map(item => item.url));
        }

        // 仅提取需要的file_url值和计算文件大小
        const getFileSize = async (url) => {
            try {
                const res = await fetch(url, { method: 'HEAD' });
                const size = res.headers.get('content-length');
                return size ? (size / (1024 * 1024)).toFixed(2) : '0';
            } catch (error) {
                console.error('Error fetching file size:', error);
                return '0';
            }
        };

        let pageContent = 1;
        const extractedData = [];
        let hasMoreData = true;

        while (hasMoreData) {
            // 使用获取到的access token请求内容数据
            const dataResponse = await fetch('https://apigateway.muvi.com/content', {
                method: 'POST',
                headers: {
                    'accept': 'application/json, text/plain, */*',
                    'authorization': `Bearer ${accessToken}`,
                    'cache-control': 'no-cache',
                    'content-type': 'application/json',
                    'origin': 'https://nymey.com',
                    'referer': 'https://nymey.com/',
                    'sec-ch-ua': '"Not-A.Brand";v="99", "Chromium";v="124"',
                    'sec-ch-ua-mobile': '?1',
                    'sec-ch-ua-platform': 'Android',
                    'sec-fetch-dest': 'empty',
                    'sec-fetch-mode': 'cors',
                    'sec-fetch-site': 'cross-site',
                    'user-agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36'
                },
                body: JSON.stringify({
                    query: `{featuredContentList(user_type:":user_type",end_user_uuid: ":me",ip_address:":ip",app_token: ":app_token", product_key: ":product_key", store_key:":store_key", user_uuid:":me", feature_section_uuid:"",page_content:${pageContent},per_page_content:12,content_asset_type:"", maturity_rating_uuid: ":maturity_rating_uuid", profile_uuid:":profile_uuid"){featured_content_list {section_content_list {content_list {posters {website {file_url} mobile_apps {file_url}} banners {website {file_url} mobile_apps {file_url}} trailer_details {file_url}}}}}}`
                }),
                agent: new https.Agent({
                    rejectUnauthorized: false
                })
            });

            if (!dataResponse.ok) {
                console.error('Failed to fetch data from API', dataResponse.statusText);
                return;
            }

            const newData = await dataResponse.json();
            hasMoreData = false;

            for (const section of newData.data.featuredContentList.featured_content_list) {
                for (const content of section.section_content_list.content_list) {
                    const urls = [
                        content.posters?.website?.[0]?.file_url,
                        content.posters?.mobile_apps?.[0]?.file_url,
                    ];

                    for (const url of urls) {
                        if (url) {
                            hasMoreData = true;
                            if (existingUrls.has(url)) {
                                console.log(`URL already exists: ${url}. Exiting program.`);
                                process.exit(0);
                            } else {
                                const size = await getFileSize(url);
                                extractedData.push({ url, size, isTrailer: false });
                            }
                        }
                    }

                    const trailerUrl = content.trailer_details?.file_url;
                    if (trailerUrl) {
                        hasMoreData = true;
                        if (existingUrls.has(trailerUrl)) {
                            console.log(`URL already exists: ${trailerUrl}. Exiting program.`);
                            process.exit(0);
                        } else {
                            const size = await getFileSize(trailerUrl);
                            extractedData.push({ url: trailerUrl, size, isTrailer: true });
                        }
                    }
                }
            }

            pageContent++;
        }

        // 合并新数据和现有数据并去重
        const combinedData = [...extractedData, ...existingData];
        const uniqueData = Array.from(new Set(combinedData.map(item => item.url)))
            .map(url => combinedData.find(item => item.url === url));

        // 写入更新后的数据到 content.json 文件
        fs.writeFileSync(existingDataPath, JSON.stringify(uniqueData, null, 2));
        console.log('content.json has been updated.');
    } catch (error) {
        console.error('Error fetching data:', error);
    }
};

// 手动运行一次更新 content.json
updateContentJson();
