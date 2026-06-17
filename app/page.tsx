"use client";

import { useState, useCallback, useEffect, useRef } from 'react';
import Header from './components/Header';
import { supabase } from './lib/supabase';

type TaskStatus = 'idle' | 'pending' | 'processing' | 'completed' | 'failed' | 'error';

interface Task {
  id: number;
  prompt: string;
  imageUrls: string[];
  imagePreviews: string[];
  status: TaskStatus;
  videoUrl: string;
  taskId: string;
  model: string;
}

interface ModelConfig {
  id: string;
  name: string;
  duration: number;
}

const MODELS: ModelConfig[] = [
  { id: 'grok-video-3-10s', name: 'Grok 3', duration: 10 },
  { id: 'veo', name: 'VEO', duration: 8 },
  { id: 'veo-4k', name: 'VEO 4K', duration: 8 },
];

interface GlobalConfig {
  model: string;
  videoRatio: string;
  duration: number;
  apiKey: string;
}

export default function Home() {
  const [showVideoKey, setShowVideoKey] = useState(false);
  const [tasks, setTasks] = useState<Task[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('videoTasks');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {
          // 如果解析失败，返回默认值
        }
      }
    }
    return [
      { id: 1, prompt: '', imageUrls: [], imagePreviews: [], status: 'idle', videoUrl: '', taskId: '' },
      { id: 2, prompt: '', imageUrls: [], imagePreviews: [], status: 'idle', videoUrl: '', taskId: '' },
      { id: 3, prompt: '', imageUrls: [], imagePreviews: [], status: 'idle', videoUrl: '', taskId: '' },
    ];
  });

  const [globalConfig, setGlobalConfig] = useState<GlobalConfig>(() => {
    if (typeof window !== 'undefined') {
      const savedApiKey = localStorage.getItem('userApiKey') || '';
      return {
        model: 'grok-video-3-10s',
        videoRatio: '16:9',
        duration: 10,
        apiKey: savedApiKey,
      };
    }
    return {
      model: 'grok-video-3-10s',
      videoRatio: '16:9',
      duration: 10,
      apiKey: '',
    };
  });

  const getCurrentModelConfig = () => {
    return MODELS.find(m => m.id === globalConfig.model) || MODELS[0];
  };

  const pollingIntervalsRef = useRef<Record<number, ReturnType<typeof setInterval>>>({});
  const fileInputRef = useRef<Record<number, Record<number, HTMLInputElement | null>>>({});

  useEffect(() => {
    // 刷新页面后，恢复正在处理中的任务的轮询
    const pendingTasks = tasks.filter(t => t.status === 'pending' || t.status === 'processing');
    if (pendingTasks.length > 0) {
      console.log(`🔄 恢复 ${pendingTasks.length} 个任务的轮询...`);
    }
  }, []);

  useEffect(() => {
    // 任务状态变化时保存到 localStorage
    localStorage.setItem('videoTasks', JSON.stringify(tasks));
    
    // 如果有正在处理的任务且有 taskId，启动轮询
    const pendingTasks = tasks.filter(t => (t.status === 'pending' || t.status === 'processing') && t.taskId);
    if (pendingTasks.length > 0) {
      for (const task of pendingTasks) {
        if (!pollingIntervalsRef.current[task.id]) {
          pollTask(task.taskId!, task.id);
        }
      }
    }
  }, [tasks]);

  const isGenerating = (status: TaskStatus): boolean => {
    return ['pending', 'processing'].includes(status);
  };

  const addTask = () => {
    const newId = tasks.length > 0 ? Math.max(...tasks.map(t => t.id)) + 1 : 1;
    setTasks([...tasks, { id: newId, prompt: '', imageUrls: [], imagePreviews: [], status: 'idle', videoUrl: '', taskId: '', model: '' }]);
  };

  const clearAll = () => {
    Object.values(pollingIntervalsRef.current).forEach(interval => clearInterval(interval));
    pollingIntervalsRef.current = {};
    setTasks([
      { id: 1, prompt: '', imageUrls: [], imagePreviews: [], status: 'idle', videoUrl: '', taskId: '', model: '' },
      { id: 2, prompt: '', imageUrls: [], imagePreviews: [], status: 'idle', videoUrl: '', taskId: '', model: '' },
      { id: 3, prompt: '', imageUrls: [], imagePreviews: [], status: 'idle', videoUrl: '', taskId: '', model: '' },
    ]);
    setGlobalConfig({
      model: 'grok-video-3-10s',
      videoRatio: '16:9',
      duration: 10,
      apiKey: globalConfig.apiKey,
    });
  };

  const deleteTask = useCallback((taskId: number) => {
    if (pollingIntervalsRef.current[taskId]) {
      clearInterval(pollingIntervalsRef.current[taskId]);
      delete pollingIntervalsRef.current[taskId];
    }
    setTasks(prevTasks => prevTasks.filter(t => t.id !== taskId));
  }, []);

  const stopGeneration = useCallback((taskId: number) => {
    if (pollingIntervalsRef.current[taskId]) {
      clearInterval(pollingIntervalsRef.current[taskId]);
      delete pollingIntervalsRef.current[taskId];
    }
    setTasks(prevTasks => prevTasks.map(t =>
      t.id === taskId ? { ...t, status: 'idle' as TaskStatus, videoUrl: '', taskId: '' } : t
    ));
  }, []);

  const MAX_IMAGES = 3;
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  const MAX_WIDTH = 1920;
  const MAX_HEIGHT = 1080;

  const compressImage = useCallback(async (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          let width = img.width;
          let height = img.height;
          
          // 缩放图片到最大尺寸
          if (width > MAX_WIDTH || height > MAX_HEIGHT) {
            const ratio = Math.min(MAX_WIDTH / width, MAX_HEIGHT / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }
          
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            
            // 根据文件大小调整质量
            let quality = 0.9;
            if (file.size > 5 * 1024 * 1024) {
              quality = 0.7;
            } else if (file.size > 2 * 1024 * 1024) {
              quality = 0.8;
            }
            
            const base64 = canvas.toDataURL('image/jpeg', quality);
            resolve(base64);
          } else {
            // 如果canvas不可用，返回原始文件
            resolve(event.target?.result as string);
          }
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  }, []);

  const handleFileSelect = useCallback(async (taskId: number, imageIndex: number, file: File | null) => {
    if (!file) return;

    // 检查文件大小
    if (file.size > MAX_FILE_SIZE) {
      alert(`图片大小不能超过 ${MAX_FILE_SIZE / (1024 * 1024)}MB`);
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setTasks(prevTasks => prevTasks.map(t => {
      if (t.id === taskId) {
        const newPreviews = [...t.imagePreviews];
        newPreviews[imageIndex] = previewUrl;
        return { ...t, imagePreviews: newPreviews };
      }
      return t;
    }));

    try {
      const base64 = await compressImage(file);
      setTasks(prevTasks => prevTasks.map(t => {
        if (t.id === taskId) {
          const newUrls = [...t.imageUrls];
          newUrls[imageIndex] = base64;
          return { ...t, imageUrls: newUrls };
        }
        return t;
      }));
    } catch (error) {
      console.error('图片压缩失败:', error);
      // 压缩失败时使用原始文件
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = e.target?.result as string;
        setTasks(prevTasks => prevTasks.map(t => {
          if (t.id === taskId) {
            const newUrls = [...t.imageUrls];
            newUrls[imageIndex] = base64;
            return { ...t, imageUrls: newUrls };
          }
          return t;
        }));
      };
      reader.readAsDataURL(file);
    }
  }, [compressImage]);

  const removeImage = useCallback((taskId: number, imageIndex: number) => {
    setTasks(prevTasks => prevTasks.map(t => {
      if (t.id === taskId) {
        const newUrls = [...t.imageUrls];
        const newPreviews = [...t.imagePreviews];
        newUrls.splice(imageIndex, 1);
        newPreviews.splice(imageIndex, 1);
        return { ...t, imageUrls: newUrls, imagePreviews: newPreviews };
      }
      return t;
    }));
  }, []);

  const updateImageUrl = useCallback((taskId: number, imageIndex: number, url: string) => {
    setTasks(prevTasks => prevTasks.map(t => {
      if (t.id === taskId) {
        const newUrls = [...t.imageUrls];
        newUrls[imageIndex] = url;
        return { ...t, imageUrls: newUrls };
      }
      return t;
    }));
  }, []);

  const pollTask = useCallback(async (taskIdStr: string, taskIdNum: number) => {
    setTasks(prevTasks => prevTasks.map(t =>
      t.id === taskIdNum ? { ...t, status: 'processing' as TaskStatus } : t
    ));

    let pollCount = 0;
    const maxPollCount = 120;

    const pollInterval = setInterval(async () => {
      try {
        pollCount++;
        console.log(`[前端轮询] 第 ${pollCount} 次轮询，任务ID: ${taskIdStr}`);

        const pollResponse = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: taskIdStr, poll: true, apiKey: globalConfig.apiKey }),
        });

        const pollText = await pollResponse.text();
        console.log('[前端轮询] 响应内容:', pollText);

        if (!pollResponse.ok) {
          console.log(`[前端轮询] HTTP错误: ${pollResponse.status}`);
          if (pollCount >= maxPollCount) {
            clearInterval(pollInterval);
            delete pollingIntervalsRef.current[taskIdNum];
            setTasks(prevTasks => prevTasks.map(t =>
              t.id === taskIdNum ? { ...t, status: 'failed' as TaskStatus } : t
            ));
            alert('轮询超时');
          }
          return;
        }

        const pollResult = JSON.parse(pollText);

        console.log('[前端轮询] 任务状态:', pollResult.status);
        console.log('[前端轮询] 视频URL:', pollResult.video_url || pollResult.url);

        if (pollResult.status === 'completed') {
          const videoUrl = pollResult.video_url || pollResult.url;
          clearInterval(pollInterval);
          delete pollingIntervalsRef.current[taskIdNum];
          console.log('[前端轮询] ✅ 任务完成，视频URL:', videoUrl);
          setTasks(prevTasks => prevTasks.map(t =>
            t.id === taskIdNum ? { ...t, status: 'completed' as TaskStatus, videoUrl } : t
          ));
        } else if (pollResult.status === 'failed') {
          clearInterval(pollInterval);
          delete pollingIntervalsRef.current[taskIdNum];
          setTasks(prevTasks => prevTasks.map(t =>
            t.id === taskIdNum ? { ...t, status: 'failed' as TaskStatus } : t
          ));
          alert(`视频生成失败:\n${pollResult.error || '未知错误'}`);
        } else if (pollCount >= maxPollCount) {
          clearInterval(pollInterval);
          delete pollingIntervalsRef.current[taskIdNum];
          setTasks(prevTasks => prevTasks.map(t =>
            t.id === taskIdNum ? { ...t, status: 'failed' as TaskStatus } : t
          ));
          alert('视频生成超时，请重试');
        } else {
          console.log(`[前端轮询] 任务进行中: ${pollResult.status || 'processing'}`);
        }
      } catch (error) {
        console.error('[前端轮询] 轮询异常:', error);
        if (pollCount >= maxPollCount) {
          clearInterval(pollInterval);
          delete pollingIntervalsRef.current[taskIdNum];
          setTasks(prevTasks => prevTasks.map(t =>
            t.id === taskIdNum ? { ...t, status: 'failed' as TaskStatus } : t
          ));
          alert('轮询异常');
        }
      }
    }, 5000);

    pollingIntervalsRef.current[taskIdNum] = pollInterval;
  }, [globalConfig.apiKey]);

  const updateTask = (taskId: number, field: string, value: string) => {
    setTasks(prevTasks => prevTasks.map(task =>
      task.id === taskId ? { ...task, [field]: value } : task
    ));
  };

  const updateGlobalConfig = useCallback((field: keyof GlobalConfig, value: string | number) => {
    setGlobalConfig(prevConfig => {
      if (field === 'model') {
        const modelConfig = MODELS.find(m => m.id === value);
        return { 
          ...prevConfig, 
          model: value as string,
          duration: modelConfig?.duration || prevConfig.duration 
        };
      }
      if (field === 'apiKey') {
        // 保存到 localStorage
        localStorage.setItem('userApiKey', value as string);
      }
      return { ...prevConfig, [field]: value };
    });
  }, []);

  const downloadVideo = useCallback((videoUrl: string, taskId: number, model: string) => {
    try {
      // 判断是否为VEO模型（需要代理）
      const isVeoModel = model === 'veo' || model === 'veo-4k';
      
      if (isVeoModel) {
        // VEO模型：使用后端代理API下载视频，避免CORS问题
        const encodedUrl = encodeURIComponent(videoUrl);
        const downloadUrl = `/api/download-video?url=${encodedUrl}`;
        window.open(downloadUrl, '_blank');
      } else {
        // Grok模型：直接下载
        const link = document.createElement('a');
        link.href = videoUrl;
        link.download = `video_${taskId}_${Date.now()}.mp4`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (error) {
      console.error('下载失败:', error);
      alert('下载失败，请重试');
    }
  }, []);

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      alert('复制成功');
    } catch {
      alert('复制失败，请重试');
    }
  }, []);

  const handleGenerate = useCallback(async (taskId: number) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task || isGenerating(task.status)) return;
    if (!task.prompt.trim()) {
      alert('请输入提示词');
      return;
    }

    const modelConfig = getCurrentModelConfig();

    const { data } = await supabase.auth.getSession();
    const user = data?.session?.user;
    if (!user) {
      alert('请先登录后再使用视频生成功能');
      return;
    }

    const { model, videoRatio, duration, apiKey } = globalConfig;

    if (!apiKey) {
      alert('请先在设置中填写您的 API Key');
      return;
    }

    setTasks(prevTasks => prevTasks.map(t =>
      t.id === taskId ? { ...t, status: 'pending' as TaskStatus, model } : t
    ));

    const requestBody: Record<string, unknown> = {
      prompt: task.prompt,
      model,
      aspect_ratio: videoRatio,
      duration: duration,
      apiKey: apiKey,
    };

    // 支持多张参考图（最多3张）
    const validImageUrls = task.imageUrls.filter(url => url && url.trim());
    if (validImageUrls.length > 0) {
      requestBody.input_reference = validImageUrls;
    }

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const responseText = await response.text();

      if (!response.ok) {
        let errorDetail = '未知错误';
        try {
          const errorJson = JSON.parse(responseText);
          errorDetail = errorJson.error || errorJson.message || responseText;
        } catch {
          errorDetail = responseText;
        }
        setTasks(prevTasks => prevTasks.map(t =>
          t.id === taskId ? { ...t, status: 'error' as TaskStatus } : t
        ));
        alert(`请求失败 (${response.status}):\n${errorDetail}`);
        return;
      }

      const data = JSON.parse(responseText);

      if (data.status === 'completed' && data.video_url) {
        setTasks(prevTasks => prevTasks.map(t =>
          t.id === taskId ? { ...t, status: 'completed' as TaskStatus, videoUrl: data.video_url, taskId: data.id } : t
        ));
      } else if (data.status === 'failed') {
        setTasks(prevTasks => prevTasks.map(t =>
          t.id === taskId ? { ...t, status: 'failed' as TaskStatus } : t
        ));
        alert(`视频生成失败:\n${data.error}`);
      } else if (data.id) {
        const idStr = data.id;
        setTasks(prevTasks => prevTasks.map(t =>
          t.id === taskId ? { ...t, taskId: idStr } : t
        ));
        pollTask(idStr, taskId);
      } else {
        setTasks(prevTasks => prevTasks.map(t =>
          t.id === taskId ? { ...t, status: 'error' as TaskStatus } : t
        ));
        alert('未获取到任务ID');
      }
    } catch (error) {
      setTasks(prevTasks => prevTasks.map(t =>
        t.id === taskId ? { ...t, status: 'error' as TaskStatus } : t
      ));
      alert(`请求失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }, [tasks, globalConfig, pollTask]);

  useEffect(() => {
    return () => {
      Object.values(pollingIntervalsRef.current).forEach(interval => clearInterval(interval));
    };
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('videoTasks', JSON.stringify(tasks));
    }
  }, [tasks]);

  return (
    <div className="min-h-screen bg-[#1A1C1E]">
      <Header />

      <div className="max-w-7xl mx-auto px-6 mb-8">
        <div className="bg-[#222428] backdrop-blur-md rounded-2xl border border-white/10 p-6" style={{ boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)' }}>
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-white/10">
            <div className="w-10 h-10 bg-[#D4AF37] rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-[#1A1C1E]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-[#E5E5E5]" style={{ fontFamily: '"Noto Serif SC", Georgia, serif' }}>全局配置</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
            <div>
              <label className="block text-sm text-gray-400 mb-2 font-medium">AI 模型</label>
              <select
                value={globalConfig.model}
                onChange={(e) => updateGlobalConfig('model', e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 transition-all appearance-none cursor-pointer"
              >
                {MODELS.map(model => (
                  <option key={model.id} value={model.id}>{model.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2 font-medium">视频比例</label>
              <select
                value={globalConfig.videoRatio}
                onChange={(e) => updateGlobalConfig('videoRatio', e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 transition-all appearance-none cursor-pointer"
              >
                <option value="16:9">横屏 16:9</option>
                <option value="9:16">竖屏 9:16</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2 font-medium">生成时长</label>
              <select
                value={globalConfig.duration}
                onChange={(e) => updateGlobalConfig('duration', Number(e.target.value))}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 transition-all appearance-none cursor-pointer"
              >
                <option value={getCurrentModelConfig().duration}>{getCurrentModelConfig().duration}秒</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2 font-medium">API Key</label>
              <div className="relative">
                <input
                  type={showVideoKey ? 'text' : 'password'}
                  value={globalConfig.apiKey}
                  onChange={(e) => updateGlobalConfig('apiKey', e.target.value)}
                  placeholder="请输入您的 API Key"
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 transition-all pr-24"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                  {globalConfig.apiKey && (
                    <button
                      type="button"
                      onClick={() => updateGlobalConfig('apiKey', '')}
                      className="text-gray-400 hover:text-red-400 transition-colors"
                      title="清空 API Key"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowVideoKey(!showVideoKey)}
                    className="text-gray-400 hover:text-gray-200 transition-colors"
                  >
                    {showVideoKey ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-4">
            <button
              onClick={addTask}
              className="px-6 py-3 bg-[#D4AF37] text-[#1A1C1E] font-medium rounded-xl hover:bg-[#E8C860] transition-all duration-300 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              添加任务
            </button>
            <button
              onClick={clearAll}
              className="px-6 py-3 bg-[#1A1C1E] text-[#EF4444] font-medium rounded-xl hover:bg-[#2A2C2E] transition-all duration-300 flex items-center gap-2 border border-white/10"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              清空所有
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 pb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tasks.map((task) => (
            <div
              key={task.id}
              className="bg-[#222428] rounded-2xl border border-white/10 overflow-hidden" style={{ boxShadow: '0 4px 20px rgba(0, 0, 0, 0.2)' }}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-[#D4AF37] rounded-lg flex items-center justify-center">
                    <svg className="w-4 h-4 text-[#1A1C1E]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  </div>
                  <span className="text-sm font-medium text-[#E5E5E5]">任务 #{task.id}</span>
                </div>
                <div className="flex items-center gap-3">
                  {isGenerating(task.status) && (
                    <span className="px-3 py-1 bg-[#D4AF37] text-[#1A1C1E] text-xs font-medium rounded-full">
                      生成中
                    </span>
                  )}
                  {task.status === 'completed' && (
                    <span className="px-3 py-1 bg-[#22C55E] text-white text-xs font-medium rounded-full">
                      已完成
                    </span>
                  )}
                  {task.status === 'failed' && (
                    <span className="px-3 py-1 bg-[#EF4444] text-white text-xs font-medium rounded-full">
                      失败
                    </span>
                  )}
                  {task.status === 'error' && (
                    <span className="px-3 py-1 bg-[#EF4444] text-white text-xs font-medium rounded-full">
                      错误
                    </span>
                  )}
                  <button
                    onClick={() => deleteTask(task.id)}
                    className="text-[#666] hover:text-[#EF4444] transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-xs text-[#888] mb-2">提示词</label>
                  <textarea
                    value={task.prompt}
                    onChange={(e) => updateTask(task.id, 'prompt', e.target.value)}
                    placeholder="描述你想要的视频..."
                    rows={3}
                    className="w-full bg-[#1A1C1E] border border-white/10 rounded-xl px-4 py-3 text-sm text-[#E5E5E5] placeholder-[#666] focus:outline-none focus:border-[#D4AF37] resize-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs text-[#888] mb-2">参考图（可选，最多3张）</label>
                  {/* 上传区域 */}
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    {[0, 1, 2].map((index) => (
                      <div key={index}>
                        <input
                          ref={(el) => { 
                            if (!fileInputRef.current[task.id]) {
                              fileInputRef.current[task.id] = {} as Record<number, HTMLInputElement | null>;
                            }
                            fileInputRef.current[task.id][index] = el;
                          }}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => handleFileSelect(task.id, index, e.target.files?.[0] || null)}
                        />
                        {task.imagePreviews[index] ? (
                          <div className="relative border border-white/10 rounded-xl overflow-hidden bg-[#1A1C1E] aspect-square">
                            <img 
                              src={task.imagePreviews[index]} 
                              alt={`预览图${index + 1}`} 
                              className="w-full h-full object-contain" 
                            />
                            <button
                              onClick={() => {
                                removeImage(task.id, index);
                                const fileInput = fileInputRef.current[task.id]?.[index];
                                if (fileInput) {
                                  fileInput.value = '';
                                }
                              }}
                              className="absolute top-1 right-1 w-5 h-5 bg-[#EF4444] text-white rounded-full flex items-center justify-center hover:bg-[#DC2626] transition-colors"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        ) : (
                          <div
                            onClick={() => fileInputRef.current[task.id]?.[index]?.click()}
                            className="border-2 border-dashed border-white/10 rounded-xl p-4 text-center hover:border-[#D4AF37]/50 hover:bg-[#D4AF37]/5 transition-all cursor-pointer bg-[#1A1C1E] aspect-square flex flex-col items-center justify-center gap-1"
                          >
                            <svg className="w-6 h-6 text-[#666]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <span className="text-xs text-[#666]">图{index + 1}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  {/* URL输入区域 */}
                  <div className="space-y-2">
                    {[0, 1, 2].map((index) => (
                      <div key={index} className="flex gap-2">
                        <span className="text-xs text-[#666] mt-3 w-6">图{index + 1}</span>
                        <input
                          type="text"
                          value={task.imageUrls[index] || ''}
                          onChange={(e) => updateImageUrl(task.id, index, e.target.value)}
                          className="flex-1 bg-[#1A1C1E] border border-white/10 rounded-xl px-4 py-2 text-sm text-[#E5E5E5] placeholder-[#666] focus:outline-none focus:border-[#D4AF37] transition-all"
                          placeholder="图片 URL"
                        />
                        <button
                          onClick={() => copyToClipboard(task.imageUrls[index] || '')}
                          disabled={!task.imageUrls[index]}
                          className="px-3 py-2 text-xs bg-[#1A1C1E] text-[#D4AF37] border border-[#D4AF37]/30 rounded-xl hover:bg-[#D4AF37]/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          复制
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {isGenerating(task.status) ? (
                  <>
                    <button
                      onClick={() => stopGeneration(task.id)}
                      className="w-full py-3 font-medium rounded-xl transition-all duration-200 flex items-center justify-center gap-2 shadow-lg border-2 bg-[#DC2626] border-[#DC2626]/50 hover:bg-[#B91C1C] text-white"
                    >
                      <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      终止生成
                    </button>
                    <div className="space-y-2">
                      <div className="flex items-center justify-center text-sm text-[#D4AF37]">
                        <svg className="w-4 h-4 mr-2 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        渲染中...
                      </div>
                      <div className="w-full h-2 bg-[#1A1C1E] rounded-full overflow-hidden">
                        <div className="h-full bg-[#D4AF37] animate-pulse rounded-full" style={{ width: '100%' }} />
                      </div>
                    </div>
                  </>
                ) : (
                  <button
                    onClick={() => handleGenerate(task.id)}
                    disabled={isGenerating(task.status)}
                    className={`w-full py-3 font-medium rounded-xl transition-all duration-200 flex items-center justify-center gap-2 shadow-lg border-2 ${
                      task.status === 'completed'
                        ? 'bg-[#22C55E] border-[#22C55E]/50 hover:bg-[#16A34A] text-white'
                        : task.status === 'failed' || task.status === 'error'
                        ? 'bg-[#EF4444] border-[#EF4444]/50 hover:bg-[#DC2626] text-white'
                        : 'bg-[#D4AF37] border-[#D4AF37]/50 hover:bg-[#E8C860] text-[#1A1C1E]'
                    }`}
                  >
                    {task.status === 'completed' && (
                      <>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        生成完成
                      </>
                    )}
                    {(task.status === 'failed' || task.status === 'error') && (
                      <>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        重试
                      </>
                    )}
                    {task.status === 'idle' && (
                      <>
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                        生成视频
                      </>
                    )}
                  </button>
                )}

                {task.status === 'completed' && task.videoUrl && (
                  <div className="space-y-3">
                    <div className="relative rounded-xl overflow-hidden bg-black" style={{ aspectRatio: '16/9' }}>
                      <video src={task.videoUrl} className="w-full h-full object-contain" controls preload="metadata" />
                    </div>
                    <button
                      onClick={() => downloadVideo(task.videoUrl, task.id, task.model)}
                      className="w-full py-3 font-medium rounded-xl transition-all duration-200 flex items-center justify-center gap-2 shadow-lg border-2 bg-[#3B82F6] border-[#3B82F6]/50 hover:bg-[#2563EB] text-white"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      下载视频
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
