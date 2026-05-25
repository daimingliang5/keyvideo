'use client';

import { useState } from 'react';
import Link from 'next/link';
import { supabase } from '../lib/supabase';

export default function Header() {
  const [showLogin, setShowLogin] = useState(false);
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginUsername, setLoginUsername] = useState('');

  const handleLogin = async () => {
    if (!loginEmail.trim() || !loginPassword.trim()) {
      alert('请输入邮箱和密码');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: loginPassword,
      });

      if (error) {
        alert(error.message);
      } else {
        setUser(data.user);
        setShowLogin(false);
        setLoginEmail('');
        setLoginPassword('');
        alert('登录成功！');
      }
    } catch (error: any) {
      alert(error.message || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!loginEmail.trim() || !loginPassword.trim() || !loginUsername.trim()) {
      alert('请输入用户名、邮箱和密码');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(loginEmail)) {
      alert('请输入有效的邮箱地址（如 user@example.com）');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: loginEmail,
        password: loginPassword,
        options: {
          data: {
            username: loginUsername,
          }
        }
      });

      if (error) {
        alert(error.message);
      } else if (data.user) {
        setUser(data.user);
        setShowLogin(false);
        setLoginEmail('');
        setLoginPassword('');
        setLoginUsername('');
        alert('注册成功！');
      }
    } catch (error: any) {
      alert(error.message || '注册失败');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    alert('已退出登录');
  };

  return (
    <>
      <header className="py-8 text-center relative">
        <div className="flex justify-center gap-6 mb-8">
          <Link href="/">
            <button className="px-8 py-4 bg-[#D4AF37] text-[#1A1C1E] rounded-2xl font-medium transition-all duration-300 hover:bg-[#E8C860] hover:shadow-lg hover:shadow-[#D4AF37]/20 flex items-center gap-3 text-lg" style={{ border: '1px solid rgba(212, 175, 55, 0.3)' }}>
              🎬 视频生成工具
            </button>
          </Link>
          <Link href="/image-generator">
            <button className="px-8 py-4 bg-[#2A2C2E] text-[#E5E5E5] rounded-2xl font-medium transition-all duration-300 hover:bg-[#3A3C3E] flex items-center gap-3 text-lg" style={{ border: '1px solid rgba(255, 255, 255, 0.1)' }}>
              🎨 图像生成工具
            </button>
          </Link>
        </div>

        <div className="absolute top-4 right-4 flex items-center gap-4">
          <div className="relative group">
            <button className="flex items-center gap-2 px-4 py-2.5 bg-[#222428] rounded-full transition-all duration-300 hover:bg-[#2A2C2E]" style={{ border: '1px solid rgba(255, 255, 255, 0.1)' }}>
              <svg className="w-5 h-5 text-[#E5E5E5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span className="text-[#E5E5E5] text-sm">{user ? (user.user_metadata?.username || user.email?.split('@')[0]) : '未登录'}</span>
            </button>

            <div className="absolute right-0 top-full mt-3 w-56 bg-[#222428] rounded-2xl shadow-xl border border-white/10 overflow-hidden opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300" style={{ boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)' }}>
              <div className="p-3">
                {user ? (
                  <>
                    <div className="px-4 py-3 text-[#999] text-sm border-b border-white/10">
                      {user.email}
                    </div>
                    <div className="border-t border-white/10 my-2"></div>
                    <button
                      onClick={handleLogout}
                      className="w-full text-left px-4 py-3 text-[#E74C3C] hover:bg-[#2A2C2E] rounded-xl flex items-center gap-3 text-sm transition-all duration-200"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                      </svg>
                      退出登录
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setShowLogin(true)}
                    className="w-full text-left px-4 py-3 text-[#E5E5E5] hover:bg-[#2A2C2E] rounded-xl flex items-center gap-3 text-sm transition-all duration-200"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                    </svg>
                    登录 / 注册
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <h1 className="text-4xl font-bold text-[#E5E5E5] tracking-wider" style={{ fontFamily: '"Noto Serif SC", "STSong", Georgia, serif' }}>
          明亮视频生成工具
        </h1>
        <p className="mt-4 text-base text-[#888] max-w-2xl mx-auto px-4">
          提供给学员专用版，学习短视频流量变现，购微：zhengnianxin123
        </p>
      </header>

      {showLogin && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50" onClick={() => setShowLogin(false)}>
          <div className="bg-[#222428] rounded-3xl p-10 max-w-md w-full mx-4 border border-white/10 shadow-2xl" onClick={(e) => e.stopPropagation()} style={{ boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' }}>
            <div className="flex justify-between items-start mb-8">
              <div className="text-center flex-1">
                <div className="w-20 h-20 bg-[#D4AF37] rounded-full flex items-center justify-center mx-auto mb-5" style={{ boxShadow: '0 0 30px rgba(212, 175, 55, 0.3)' }}>
                  <svg className="w-10 h-10 text-[#1A1C1E]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <h2 className="text-2xl text-[#E5E5E5] mb-2" style={{ fontFamily: '"Noto Serif SC", Georgia, serif' }}>
                  {isRegisterMode ? '立即注册' : '欢迎登录'}
                </h2>
                <p className="text-[#888] text-sm">
                  {isRegisterMode ? '注册后即可使用' : '请登录后使用完整功能'}
                </p>
              </div>
              <button onClick={() => setShowLogin(false)} className="text-[#666] hover:text-[#E5E5E5] transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-5">
              {isRegisterMode && (
                <input
                  type="text"
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  placeholder="请输入用户名"
                  className="w-full bg-[#1A1C1E] border border-white/10 rounded-xl px-5 py-4 text-[#E5E5E5] placeholder-[#666] focus:outline-none focus:border-[#D4AF37] transition-all text-base"
                />
              )}
              <input
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="请输入邮箱"
                className="w-full bg-[#1A1C1E] border border-white/10 rounded-xl px-5 py-4 text-[#E5E5E5] placeholder-[#666] focus:outline-none focus:border-[#D4AF37] transition-all text-base"
              />
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="请输入密码"
                onKeyDown={(e) => e.key === 'Enter' && (isRegisterMode ? handleRegister() : handleLogin())}
                className="w-full bg-[#1A1C1E] border border-white/10 rounded-xl px-5 py-4 text-[#E5E5E5] placeholder-[#666] focus:outline-none focus:border-[#D4AF37] transition-all text-base"
              />

              <button
                onClick={isRegisterMode ? handleRegister : handleLogin}
                disabled={loading}
                className="w-full py-4 bg-[#D4AF37] text-[#1A1C1E] rounded-xl font-bold transition-all duration-300 hover:bg-[#E8C860] hover:shadow-lg hover:shadow-[#D4AF37]/20 disabled:opacity-50 disabled:cursor-not-allowed text-lg"
              >
                {loading ? '处理中...' : (isRegisterMode ? '注册' : '登录')}
              </button>

              <div className="text-center mt-6">
                <button
                  onClick={() => setIsRegisterMode(!isRegisterMode)}
                  className="text-[#888] text-sm hover:text-[#E5E5E5] transition-colors"
                >
                  {isRegisterMode ? '已有账号？' : '还没有账号？'}
                  <span className="text-[#D4AF37] ml-1">{isRegisterMode ? '立即登录' : '立即注册'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
