import { NextResponse } from 'next/server';

// 模型映射：前端模型 -> 云雾API模型
const MODEL_MAPPING: Record<string, string> = {
  'grok-video-3-10s': 'grok-video-3-10s',
  'veo': 'veo_3_1-fast',
  'veo-4k': 'veo_3_1-fast-4K',
};

// 判断是否为VEO系列模型
const isVeoModel = (model: string): boolean => {
  return model === 'veo' || model === 'veo-4k' || model?.startsWith('veo');
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { prompt, model, input_reference, poll, id, aspect_ratio, duration, apiKey: userApiKey } = body;

    console.log('========== 视频生成请求 ==========');
    console.log('poll:', poll, 'id:', id);

    // 获取用户提供的 API Key，如果没有提供则报错
    if (!userApiKey) {
      console.error('❌ 用户未提供 API Key');
      return NextResponse.json({ error: '请在设置中填写您的 API Key' }, { status: 400 });
    }
    console.log('📋 当前模型:', model, '使用用户提供的密钥');

    const currentApiKey = userApiKey;

    // 轮询模式 - 查询任务状态
    if (poll && id) {
      return handlePollTask(id, model || '', userApiKey);
    }

    // 新建任务模式 - 创建视频
    if (!prompt) {
      return NextResponse.json({ error: '参数不完整：prompt 是必填项' }, { status: 400 });
    }

    // 调用第三方API创建任务
    console.log('🌐 开始调用视频生成API...');
    
    // 获取映射后的云雾API模型
    const apiModel = MODEL_MAPPING[model || 'grok-video-3-10s'] || 'grok-video-3-10s';
    console.log('📋 使用模型:', apiModel, '(前端模型:', model, ')');
    
    // 根据模型类型构建请求体
    let requestBody: Record<string, unknown>;
    
    if (isVeoModel(model || '')) {
      // VEO系列模型：使用新API格式
      requestBody = {
        model: apiModel,
        prompt: prompt,
        images: input_reference ? [input_reference.trim()] : [],
        enhance_prompt: true,
        enable_upsample: true,
        aspect_ratio: aspect_ratio || '16:9',
      };
    } else {
      // Grok模型：使用原有格式
      requestBody = {
        model: apiModel,
        prompt: prompt,
        aspect_ratio: aspect_ratio || '16:9',
        size: '720P',
        images: input_reference ? [input_reference.trim()] : [],
      };
    }

    console.log('📤 请求体:', JSON.stringify(requestBody));

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
      const response = await fetch('https://yunwu.ai/v1/video/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentApiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      console.log('📡 视频API响应状态:', response.status);

      const responseText = await response.text();
      console.log('📥 视频API响应内容:', responseText.substring(0, 200) + '...');

      if (!response.ok) {
        console.error('❌ 视频API请求失败:', response.status, responseText);
        let errorMessage = '生成失败';
        try {
          const errorJson = JSON.parse(responseText);
          errorMessage = errorJson.error?.message || errorJson.message || errorMessage;
        } catch {}
        return NextResponse.json({ error: errorMessage }, { status: response.status });
      }

      const result = JSON.parse(responseText);
      
      if (result.status === 'completed' && result.video_url) {
        console.log('✅ 视频生成成功');
        return NextResponse.json({ status: 'completed', video_url: result.video_url });
      } else if (result.id) {
        console.log('✅ 视频任务已创建, task_id:', result.id);
        return NextResponse.json({ status: 'pending', id: result.id });
      }

      console.error('❌ 视频API返回格式错误:', result);
      return NextResponse.json({ error: 'API 返回格式错误' }, { status: 500 });
    } catch (e) {
      clearTimeout(timeoutId);
      console.error('❌ 视频请求异常:', e);
      return NextResponse.json({ error: '请求失败: ' + (e as Error).message }, { status: 500 });
    }
  } catch (e) {
    console.error('❌ 服务器异常:', e);
    return NextResponse.json({ error: '服务器异常: ' + (e as Error).message }, { status: 500 });
  }
}

// 轮询任务状态
async function handlePollTask(id: string, model: string = '', apiKey?: string) {
  console.log('==================== [轮询] 开始 ====================');
  console.log('🔄 轮询任务ID:', id);
  
  // 如果没有提供 API Key，返回错误
  if (!apiKey) {
    console.error('❌ 轮询时未提供 API Key');
    return NextResponse.json({ error: '请在设置中填写您的 API Key' }, { status: 400 });
  }

  console.log('📤 发送请求到云雾 API (GET)...');
  const url = new URL('https://yunwu.ai/v1/video/query');
  url.searchParams.append('id', id);
  
  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
  });

  const responseText = await response.text();
  console.log('📥 [轮询] 原始响应 (长度):', responseText.length);
  console.log('📥 [轮询] 原始响应内容:', responseText);

  let result: any;
  try {
    result = JSON.parse(responseText);
  } catch (e) {
    console.error('❌ [轮询] JSON解析失败:', e);
    return NextResponse.json({ status: 'pending' });
  }

  console.log('📋 [轮询] 完整解析结果:', JSON.stringify(result, null, 2));
  
  // 打印所有顶级字段
  console.log('📋 [轮询] 所有顶级字段:', Object.keys(result));
  
  // 详细打印每个字段
  for (const key of Object.keys(result)) {
    const value = result[key];
    if (typeof value === 'object' && value !== null) {
      console.log(`📋 [轮询] ${key}:`, JSON.stringify(value, null, 2));
    } else {
      console.log(`📋 [轮询] ${key}:`, value);
    }
  }

  // 检查多种可能的状态字段
  let status = 'pending';
  if (result.status) status = result.status;
  if (result.data?.status) status = result.data.status;
  if (result.state) status = result.state; // 可能的字段名
  if (result.data?.state) status = result.data.state; // 可能的字段名

  // 检查多种可能的视频URL字段
  let videoUrl = null;
  if (result.video_url) videoUrl = result.video_url;
  if (result.url) videoUrl = result.url;
  if (result.video) videoUrl = result.video;
  if (result.output) videoUrl = result.output;
  if (result.data?.video_url) videoUrl = result.data.video_url;
  if (result.data?.url) videoUrl = result.data.url;
  if (result.data?.video) videoUrl = result.data.video;
  if (result.data?.output) videoUrl = result.data.output;

  console.log('📊 [轮询] 最终检测状态:', status);
  console.log('🎬 [轮询] 最终检测视频URL:', videoUrl);

  // 兼容处理：只要有视频URL，不管状态字段是什么，都视为完成
  if (status === 'completed' || status === 'success' || videoUrl) {
    console.log('✅ [轮询] 任务完成！');
    console.log('✅ [轮询] 返回给前端的 video_url:', videoUrl);
    return NextResponse.json({ 
      status: 'completed', 
      video_url: videoUrl 
    });
  } else if (status === 'processing' || status === 'pending' || status === 'in_progress') {
    console.log('⏳ [轮询] 任务进行中...');
    return NextResponse.json({ status: 'processing' });
  } else if (status === 'failed' || status === 'error') {
    console.error('❌ [轮询] 任务失败');
    return NextResponse.json({ 
      status: 'failed', 
      error: result.error || result.data?.error || '生成失败' 
    });
  } else {
    console.log('⏳ [轮询] 未识别状态，返回processing');
    return NextResponse.json({ status: 'processing' });
  }
}
