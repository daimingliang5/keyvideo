import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { prompt, model, size, n = 1, image, apiKey: userApiKey } = await request.json();

    console.log('========== 图片生成请求 ==========');
    console.log('prompt:', prompt?.substring(0, 50));

    // 检查用户是否提供了 API Key
    if (!userApiKey) {
      console.error('❌ 用户未提供 API Key');
      return NextResponse.json({ error: '请在设置中填写您的 API Key' }, { status: 400 });
    }

    // 检查参数
    if (!prompt) {
      return NextResponse.json({ error: '请输入提示词' }, { status: 400 });
    }

    // 调用第三方图片生成API
    console.log('🌐 开始调用云雾API...');
    const apiUrl = 'https://yunwu.ai/v1/images/generations';
    const requestBody: Record<string, unknown> = {
      model: model || 'gpt-image-2-all',
      prompt: prompt,
      size: size || '1024x1024',
      n: parseInt(String(n)) || 1,
    };

    if (image && image.length > 0) {
      requestBody.image = image;
      requestBody.mode = 'image-to-image';
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000);

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${userApiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      console.log('📡 云雾API响应状态:', response.status);

      const responseText = await response.text();

      if (!response.ok) {
        console.error('❌ 云雾API请求失败:', response.status, responseText);
        let errorMessage = '生成失败';
        try {
          const errorJson = JSON.parse(responseText);
          errorMessage = errorJson.error?.message || errorJson.message || errorMessage;
        } catch {}
        return NextResponse.json({ error: errorMessage }, { status: response.status });
      }

      const result = JSON.parse(responseText);
      console.log('📋 云雾API响应详情:', JSON.stringify(result, null, 2));
      
      let urls: string[] = [];
      
      if (result.data && Array.isArray(result.data)) {
        urls = result.data.flatMap((item: unknown) => {
          const strItem = item as string;
          if (typeof strItem === 'string') {
            if (strItem.startsWith('data:image/') || strItem.length > 1000) {
              return [strItem];
            }
            return [];
          }
          
          const itemObj = item as Record<string, unknown>;
          const nestedData = (itemObj as { data: unknown[] }).data;
          if (nestedData && Array.isArray(nestedData)) {
            return nestedData.flatMap((nestedItem: unknown) => {
              const strNestedItem = nestedItem as string;
              if (typeof strNestedItem === 'string') {
                if (strNestedItem.startsWith('data:image/') || strNestedItem.length > 1000) {
                  if (!strNestedItem.startsWith('data:')) {
                    return [`data:image/jpeg;base64,${strNestedItem}`];
                  }
                  return [strNestedItem];
                }
                return [];
              }
              
              const nestedObj = nestedItem as Record<string, unknown>;
              const url = (nestedObj as { url: string }).url ||
                          (nestedObj as { image_url: string }).image_url ||
                          '';
              
              if (url) {
                return [url];
              }
              
              const base64Fields = ['b64_json', 'data', 'image', 'imageData', 'base64', 'content'];
              for (const field of base64Fields) {
                const value = nestedObj[field] as string;
                if (typeof value === 'string' && value.length > 1000) {
                  if (!value.startsWith('data:')) {
                    return [`data:image/jpeg;base64,${value}`];
                  }
                  return [value];
                }
              }
              return [];
            }).filter(Boolean);
          }
          
          const url = (itemObj as { url: string }).url ||
                      (itemObj as { image_url: string }).image_url ||
                      '';
          
          if (!url) {
            const base64Fields = ['b64_json', 'data', 'image', 'imageData', 'base64', 'content'];
            for (const field of base64Fields) {
              const value = itemObj[field] as string;
              if (typeof value === 'string' && value.length > 1000) {
                if (!value.startsWith('data:')) {
                  return [`data:image/jpeg;base64,${value}`];
                }
                return [value];
              }
            }
          }
          
          return url ? [url] : [];
        }).filter(Boolean);
      }
      
      if (urls.length === 0 && result.images && Array.isArray(result.images)) {
        urls = result.images.flatMap((img: unknown) => {
          const strImg = img as string;
          if (typeof strImg === 'string') {
            return (strImg.startsWith('data:image/') || strImg.length > 1000) ? [strImg] : [];
          }
          const imgObj = img as Record<string, unknown>;
          const url = (imgObj as { url: string }).url ||
                      (imgObj as { image_url: string }).image_url ||
                      '';
          return url ? [url] : [];
        }).filter(Boolean);
      }
      
      if (urls.length === 0 && result.output && Array.isArray(result.output)) {
        urls = result.output.flatMap((img: unknown) => {
          const strImg = img as string;
          if (typeof strImg === 'string') {
            return (strImg.startsWith('data:image/') || strImg.length > 1000) ? [strImg] : [];
          }
          const imgObj = img as Record<string, unknown>;
          const url = (imgObj as { url: string }).url ||
                      (imgObj as { image_url: string }).image_url ||
                      '';
          return url ? [url] : [];
        }).filter(Boolean);
      }

      if (urls.length === 0 && typeof result.url === 'string') {
        urls = [result.url];
      }

      if (urls.length === 0 && typeof result.output_url === 'string') {
        urls = [result.output_url];
      }

      if (urls.length === 0) {
        const topLevelFields = ['data', 'image', 'imageData', 'base64', 'content', 'result'];
        for (const field of topLevelFields) {
          const value = (result as Record<string, unknown>)[field];
          if (typeof value === 'string' && (value.startsWith('data:image/') || value.length > 1000)) {
            urls.push(value);
          }
        }
      }

      console.log('🔍 最终提取到的图片URL/Base64:', urls.length > 0 ? `共${urls.length}张` : '无');

      if (urls.length === 0) {
        console.error('❌ 未生成任何图片');
        return NextResponse.json({ 
          error: '未生成任何图片',
          debug: {
            responseKeys: Object.keys(result),
            hasData: !!result.data
          }
        }, { status: 500 });
      }

      console.log('✅ 图片生成成功:', urls.length, '张图片');
      return NextResponse.json({ status: 'completed', urls });

    } catch (fetchError) {
      clearTimeout(timeoutId);
      console.error('❌ 网络请求失败:', fetchError);
      return NextResponse.json({ error: '网络请求失败: ' + (fetchError as Error).message }, { status: 500 });
    }

  } catch (error) {
    console.error('❌ 请求处理失败:', error);
    return NextResponse.json({ error: '请求解析失败: ' + (error as Error).message }, { status: 400 });
  }
}
