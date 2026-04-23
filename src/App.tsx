/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef, FormEvent } from 'react';
import { 
  Search, 
  Download, 
  Heart, 
  MessageSquare, 
  User, 
  Plus, 
  LogOut, 
  Trash2, 
  Shield, 
  Gamepad2, 
  Wrench, 
  LayoutGrid,
  Send,
  ExternalLink,
  FileCode,
  ArrowRight,
  Star,
  Upload,
  MessageCircle,
  Smartphone,
  Share2,
  Copy,
  Check,
  Image as ImageIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  User as UserType, 
  AppEntry, 
  Message as MessageType, 
  Review,
  OWNER_EMAIL, 
  PROJECT_NAME, 
  UserRole 
} from './types';
import { 
  auth, 
  db, 
  googleProvider,
  storage,
  testFirestoreConnection
} from './services/firebase';
import { 
  signInWithPopup, 
  signInWithPhoneNumber, 
  RecaptchaVerifier, 
  onAuthStateChanged, 
  signOut,
  updatePassword
} from 'firebase/auth';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  addDoc, 
  deleteDoc, 
  updateDoc, 
  increment,
  limit,
  arrayUnion,
  arrayRemove
} from 'firebase/firestore';

export default function App() {
  const [currentUser, setCurrentUser] = useState<UserType | null>(null);
  const [users, setUsers] = useState<UserType[]>([]);
  const [apps, setApps] = useState<AppEntry[]>([]);
  const [messages, setMessages] = useState<MessageType[]>([]);
  const [view, setView] = useState<'store' | 'messages' | 'profile' | 'admin' | 'upload'>('store');
  const [authView, setAuthView] = useState<'login' | 'register' | 'phone'>('login');
  const [isLoading, setIsLoading] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // Search and Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'الكل' | 'ألعاب' | 'أدوات'>('الكل');
  
  // Phone Auth State
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [verificationId, setVerificationId] = useState<any>(null);
  const [selectedApkName, setSelectedApkName] = useState<string | null>(null);
  const [selectedImageName, setSelectedImageName] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const recaptchaRef = useRef<HTMLDivElement>(null);

  // Sync Auth State
  useEffect(() => {
    // Initial connection test
    const checkConnection = async () => {
      const result = await testFirestoreConnection();
      if (!result.success) {
        setConnectionError("تعذر الاتصال بقاعدة البيانات. قد يكون اتصال الإنترنت ضعيفاً.");
      }
    };
    checkConnection();

    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        const userDoc = await getDoc(doc(db, 'users', fbUser.uid));
        if (userDoc.exists()) {
          setCurrentUser(userDoc.data() as UserType);
        } else {
          const isOwner = fbUser.email === OWNER_EMAIL;
          const newUser: UserType = {
            id: fbUser.uid,
            email: fbUser.email || '',
            name: fbUser.displayName || 'مستخدم جديد',
            role: isOwner ? 'owner' : 'user',
            createdAt: Date.now(),
            phoneNumber: fbUser.phoneNumber || null
          };
          await setDoc(doc(db, 'users', fbUser.uid), newUser);
          setCurrentUser(newUser);
          if (isOwner) {
            try {
              await setDoc(doc(db, 'admins', fbUser.uid), { email: OWNER_EMAIL });
            } catch (e) {
              console.warn("Could not set admin doc - might already exist or permission issue:", e);
            }
          }
        }
      } else {
        setCurrentUser(null);
      }
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Sync Data
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const appId = params.get('app');
    
    const qApps = query(collection(db, 'apps'), orderBy('createdAt', 'desc'), limit(60));
    const unsubApps = onSnapshot(qApps, (s) => {
      const fetchedApps = s.docs.map(d => ({ ...d.data(), id: d.id } as AppEntry));
      setApps(fetchedApps);
      
      if (appId && fetchedApps.length > 0) {
        const sharedApp = fetchedApps.find(a => a.id === appId);
        if (sharedApp) {
          setSearchQuery(sharedApp.name);
          window.history.replaceState({}, '', window.location.pathname);
        }
      }
    }, (err) => console.error("Apps sync error:", err));
    return () => unsubApps();
  }, []);

  useEffect(() => {
    if (currentUser?.id) {
      const qUsers = query(collection(db, 'users'), limit(50));
      const unsubUsers = onSnapshot(qUsers, 
        (s) => setUsers(s.docs.map(d => ({ ...d.data(), id: d.id } as UserType))),
        (error) => console.error("Users sync error:", error)
      );
      return () => unsubUsers();
    }
  }, [currentUser?.id]);

  useEffect(() => {
    if (currentUser?.id) {
      // Query for messages where current user is receiver OR sender
      const qMsgs = query(
        collection(db, 'messages'), 
        where('receiverId', '==', currentUser.id), 
        orderBy('timestamp', 'desc'),
        limit(100)
      );
      const unsub = onSnapshot(qMsgs, 
        (s) => setMessages(s.docs.map(d => ({ ...d.data(), id: d.id } as MessageType))),
        (err) => console.error("Messages Received error:", err)
      );
      
      const qSent = query(
        collection(db, 'messages'),
        where('senderId', '==', currentUser.id),
        orderBy('timestamp', 'desc'),
        limit(50)
      );
      const unsubSent = onSnapshot(qSent, (s) => {
        const sentMsgs = s.docs.map(d => ({ ...d.data(), id: d.id } as MessageType));
        setMessages(prev => {
          const combined = [...prev, ...sentMsgs];
          // Simple duplication filter
          const unique = Array.from(new Map(combined.map(m => [m.id, m])).values());
          return unique.sort((a, b) => b.timestamp - a.timestamp);
        });
      }, (err) => console.error("Messages Sent error:", err));

      return () => { unsub(); unsubSent(); };
    }
  }, [currentUser?.id]);

  const handleGoogleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      alert('خطأ في تسجيل الدخول عبر جوجل');
    }
  };

const handlePhoneSignIn = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const verifier = new RecaptchaVerifier(auth, recaptchaRef.current!, { size: 'invisible' });
      const confirmation = await signInWithPhoneNumber(auth, phone, verifier);
      setVerificationId(confirmation);
    } catch (error) {
      alert('خطأ في إرسال رمز التحقق');
    }
  };

  const handleVerifyOtp = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await verificationId.confirm(otp);
    } catch (error) {
      alert('رمز التحقق غير صحيح');
    }
  };

  const handleLogout = () => signOut(auth);

  const handleLike = async (app: AppEntry) => {
    if (!currentUser) return;
    const isLiking = !app.likes.includes(currentUser.id);
    const appRef = doc(db, 'apps', app.id);
    
    // Optimistic Update: Update UI immediately
    setApps(prev => prev.map(a => a.id === app.id ? {
      ...a,
      likes: isLiking ? [...a.likes, currentUser.id] : a.likes.filter(id => id !== currentUser.id)
    } : a));

    try {
      await updateDoc(appRef, {
        likes: isLiking ? arrayUnion(currentUser.id) : arrayRemove(currentUser.id)
      });
    } catch (e) {
      console.error("Like error:", e);
      // Revert in case of error
      setApps(prev => prev.map(a => a.id === app.id ? app : a));
    }
  };

  const handleDownload = async (app: AppEntry) => {
    // Optimistic download increment
    setApps(prev => prev.map(a => a.id === app.id ? { ...a, downloads: a.downloads + 1 } : a));
    
    try {
      await updateDoc(doc(db, 'apps', app.id), { downloads: increment(1) });
      window.open(app.url, '_blank');
    } catch (e) {
      console.error("Download error:", e);
    }
  };

  const handleDeleteApp = async (appId: string) => {
    if (!currentUser) return;
    if (confirm('هل أنت متأكد من حذف هذا التطبيق؟')) {
      try {
        await deleteDoc(doc(db, 'apps', appId));
        alert('تم حذف التطبيق بنجاح');
      } catch (error) {
        console.error("Delete Error:", error);
        alert('حدث خطأ أثناء الحذف. قد لا تملك الصلاحية الكافية.');
      }
    }
  };

  const handleUpload = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!currentUser) return;
    const formData = new FormData(e.currentTarget);
    const apkFile = (e.currentTarget.querySelector('input[name="apkFile"]') as HTMLInputElement)?.files?.[0];
    const imageFile = (e.currentTarget.querySelector('input[name="imageFile"]') as HTMLInputElement)?.files?.[0];
    const type = formData.get('type') as string;
    
    let url = formData.get('url') as string;
    let imageUrl = '';
    
    setIsUploading(true);
    try {
      // 1. Handle APK/Link
      if (type === 'apk') {
        if (!apkFile) {
          alert('الرجاء اختيار ملف APK أولاً');
          setIsUploading(false);
          return;
        }
        const storageRef = ref(storage, `apks/${Date.now()}_${apkFile.name}`);
        const snapshot = await uploadBytes(storageRef, apkFile);
        url = await getDownloadURL(snapshot.ref);
      } else {
        if (!url || !url.startsWith('http')) {
          alert('الرجاء إدخال رابط صحيح يبدأ بـ http');
          setIsUploading(false);
          return;
        }
      }

      // 2. Handle Image
      if (imageFile) {
        const imgRef = ref(storage, `icons/${Date.now()}_${imageFile.name}`);
        const imgSnapshot = await uploadBytes(imgRef, imageFile);
        imageUrl = await getDownloadURL(imgSnapshot.ref);
      }

      // 3. Save to Firestore
      await addDoc(collection(db, 'apps'), {
        name: formData.get('name'),
        description: formData.get('description'),
        publisherId: currentUser.id,
        publisherName: currentUser.name,
        type: formData.get('type'),
        url,
        imageUrl,
        category: formData.get('category'),
        likes: [],
        downloads: 0,
        rating: 0,
        reviewCount: 0,
        createdAt: Date.now()
      });
      setView('store');
      setSelectedApkName(null);
      setSelectedImageName(null);
    } catch (error) {
      console.error(error);
      alert('حدث خطأ أثناء الرفع');
    } finally {
      setIsUploading(false);
    }
  };

  // Admin Actions
  const handleDeleteUser = async (userId: string) => {
    if (currentUser?.role !== 'owner') return;
    if (confirm('حذف المستخدم سيؤدي لحذف جميع بياناته. استمرار؟')) {
      await deleteDoc(doc(db, 'users', userId));
    }
  };

  // Messaging Actions
  const handleSendMessage = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!currentUser) return;
    const form = e.currentTarget;
    const formData = new FormData(form);
    const receiverId = formData.get('receiverId') as string;
    const text = formData.get('text') as string;

    await addDoc(collection(db, 'messages'), {
      senderId: currentUser.id,
      senderName: currentUser.name,
      receiverId,
      text,
      timestamp: Date.now()
    });
    form.reset();
    alert('تم إرسال الرسالة بنجاح');
  };

  // Profile Updating
  const handleUpdateProfile = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!currentUser) return;
    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;
    const role = formData.get('role') as UserRole;
    const password = formData.get('password') as string;

    await updateDoc(doc(db, 'users', currentUser.id), { 
      name, 
      role: currentUser.role === 'owner' ? 'owner' : role 
    });

    if (password && auth.currentUser) {
      try {
        await updatePassword(auth.currentUser, password);
        alert('تم تحديث البيانات وكلمة السر');
      } catch (err) {
        alert('خطأ في تحديث كلمة السر. قد تحتاج لإعادة تسجيل الدخول');
      }
    } else {
      alert('تم تحديث الملف الشخصي');
    }
  };

  // Auth Guard
  if (!currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-neutral-900 border border-neutral-800 p-8 rounded-3xl w-full max-w-md shadow-2xl"
        >
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-fox-orange rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-fox-orange/20">
              <Shield className="text-white w-10 h-10" />
            </div>
            <h1 className="text-3xl font-bold text-white tracking-tight">{PROJECT_NAME}</h1>
            <p className="text-neutral-500 mt-2">مرحباً بك في عالم التطبيقات</p>

            {connectionError && (
              <div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-500 text-sm flex items-center justify-center gap-3">
                <Shield size={18} />
                <div className="flex flex-col">
                  <span>{connectionError}</span>
                  <button 
                    onClick={() => window.location.reload()}
                    className="underline text-xs mt-1 font-bold w-fit"
                  >
                    إعادة المحاولة
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="flex bg-neutral-950 p-1 rounded-xl mb-6">
            <button 
              onClick={() => setAuthView('login')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${authView === 'login' ? 'bg-neutral-800 text-white shadow-sm' : 'text-neutral-500 hover:text-white'}`}
            >
              Sign In
            </button>
            <button 
              onClick={() => setAuthView('phone')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${authView === 'phone' ? 'bg-neutral-800 text-white shadow-sm' : 'text-neutral-500 hover:text-white'}`}
            >
              Phone
            </button>
          </div>

          <div ref={recaptchaRef}></div>

          {authView === 'login' ? (
            <div className="space-y-4">
              <button 
                onClick={handleGoogleLogin}
                className="w-full bg-white text-black font-bold py-3.5 rounded-xl hover:bg-neutral-200 transition-all shadow-lg flex items-center justify-center gap-2"
              >
                <Smartphone size={20} />
                دخول بجوجل
              </button>
              <div className="text-center text-xs text-neutral-600 uppercase tracking-widest my-4">أو</div>
              <p className="text-neutral-500 text-center text-sm">استخدم حساب جوجل للدخول كمالك</p>
            </div>
          ) : (
            <div className="space-y-4">
              {!verificationId ? (
                <form onSubmit={handlePhoneSignIn} className="space-y-4">
                  <input 
                    type="tel" 
                    placeholder="+966xxxxxxxxx"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="form-input" 
                    required
                  />
                  <button type="submit" className="w-full btn-primary">إرسال الرمز</button>
                </form>
              ) : (
                <form onSubmit={handleVerifyOtp} className="space-y-4">
                  <input 
                    type="text" 
                    placeholder="رمز التحقق"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    className="form-input" 
                    required 
                  />
                  <button type="submit" className="w-full btn-primary">تأكيد الرمز</button>
                </form>
              )}
            </div>
          )}
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black pb-24 md:pb-0 md:pr-64">
      {connectionError && (
        <div className="fixed top-0 left-0 right-0 z-[100] bg-red-500 text-white py-2 px-4 text-center text-sm font-bold flex items-center justify-center gap-2">
          <Shield size={16} />
          <span>{connectionError}</span>
          <button 
            onClick={() => window.location.reload()}
            className="bg-white/20 hover:bg-white/30 px-3 py-1 rounded-lg transition-colors ml-4"
          >
            تحديث الصفحة
          </button>
        </div>
      )}
      {/* Sidebar Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 h-20 bg-neutral-900/80 backdrop-blur-xl border-t border-neutral-800 flex items-center justify-around px-6 z-50 md:top-0 md:right-0 md:left-auto md:w-64 md:h-full md:flex-col md:justify-start md:pt-12 md:px-4 md:border-t-0 md:border-l">
        <div className="hidden md:flex flex-col items-center mb-12">
          <div className="w-12 h-12 bg-fox-orange rounded-xl flex items-center justify-center mb-3">
            <Shield className="text-white w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold tracking-tight text-white">{PROJECT_NAME}</h2>
        </div>

        <div className="flex md:flex-col w-full gap-2 px-2">
          <NavButton 
            active={view === 'store'} 
            onClick={() => setView('store')} 
            icon={<LayoutGrid />} 
            label="المتجر" 
          />
          <NavButton 
             active={view === 'upload'} 
             onClick={() => setView('upload')} 
             icon={<Plus />} 
             label="رفع تطبيق" 
          />
          <NavButton 
            active={view === 'messages'} 
            onClick={() => setView('messages')} 
            icon={<MessageSquare />} 
            label="الرسائل" 
          />
          <NavButton 
            active={view === 'profile'} 
            onClick={() => setView('profile')} 
            icon={<User />} 
            label="حسابي" 
          />
          {currentUser.role === 'owner' && (
            <NavButton 
              active={view === 'admin'} 
              onClick={() => setView('admin')} 
              icon={<Shield className="text-fox-orange" />} 
              label="لوحة المالك" 
            />
          )}
          
          <button 
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-red-500 hover:bg-red-500/10 transition-all mt-4 md:mt-auto"
          >
            <LogOut size={20} />
            <span className="font-medium">خروج</span>
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="p-6 md:p-12 max-w-7xl mx-auto">
        <AnimatePresence mode="wait">
          {view === 'store' && (
            <motion.div 
              key="store"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
            >
              <header className="flex flex-col gap-6 mb-10">
                <div className="flex items-center justify-between">
                  <h2 className="text-3xl font-bold text-white">اكتشف التطبيقات</h2>
                  <div className="flex items-center gap-4 text-neutral-400">
                    <span className="text-sm">مرحباً، {currentUser.name} {currentUser.role === 'owner' && '👑'}</span>
                  </div>
                </div>

                <div className="flex flex-col md:flex-row gap-4">
                  <div className="relative flex-1">
                    <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-500" size={20} />
                    <input 
                      type="text" 
                      placeholder="ابحث عن تطبيق..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-neutral-900 border border-neutral-800 pr-12 pl-4 py-3.5 rounded-2xl text-white focus:outline-none focus:border-fox-orange transition-all"
                    />
                  </div>
                  <div className="flex bg-neutral-900 p-1 rounded-2xl border border-neutral-800">
                    {(['الكل', 'ألعاب', 'أدوات'] as const).map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setCategoryFilter(cat)}
                        className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${categoryFilter === cat ? 'bg-fox-orange text-white shadow-lg shadow-fox-orange/20' : 'text-neutral-500 hover:text-white'}`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>
              </header>

              {apps.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {apps.filter(app => (app.name.toLowerCase().includes(searchQuery.toLowerCase()) || app.description.toLowerCase().includes(searchQuery.toLowerCase())) && (categoryFilter === 'الكل' || app.category === categoryFilter)).map(app => (
                    <AppCard 
                      key={app.id} 
                      app={app} 
                      onLike={() => handleLike(app)}
                      onDownload={() => handleDownload(app)}
                      onDelete={() => handleDeleteApp(app.id)}
                      currentUser={currentUser}
                      hasLiked={app.likes.includes(currentUser.id)}
                    />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-24 text-neutral-500">
                  <LayoutGrid size={64} className="mb-4 opacity-10" />
                  <p className="text-xl">لا توجد تطبيقات مطابقة</p>
                </div>
              )}
            </motion.div>
          )}

          {view === 'upload' && (
            <motion.div 
              key="upload"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="max-w-2xl mx-auto"
            >
              <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-8 shadow-xl">
                <h3 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
                  <Plus className="text-fox-orange" />
                  رفع تطبيق جديد
                </h3>
                  <form onSubmit={handleUpload} className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <label className="block text-sm text-neutral-400 mb-2 mr-1">اسم التطبيق</label>
                        <input name="name" required className="form-input" placeholder="مثلاً: تطبيق رائع" />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-sm text-neutral-400 mb-2 mr-1">الوصف</label>
                        <textarea name="description" required className="form-input min-h-[100px]" placeholder="أخبرنا المزيد عن التطبيق..." />
                      </div>
                      <div>
                        <label className="block text-sm text-neutral-400 mb-2 mr-1">نوع المحتوى</label>
                        <select name="category" className="form-input">
                          <option value="ألعاب">ألعاب</option>
                          <option value="أدوات">أدوات</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm text-neutral-400 mb-2 mr-1">طريقة الرفع</label>
                        <select name="type" className="form-input">
                          <option value="link">رابط خارجي</option>
                          <option value="apk">ملف APK</option>
                        </select>
                      </div>
                      <div className="col-span-2">
                        <label className="block text-sm text-neutral-400 mb-2 mr-1">روبط التحميل / استيراد APK</label>
                        <div className="flex gap-2">
                          <input name="url" className="form-input flex-1" placeholder="https://..." />
                          <label className="bg-neutral-800 p-3 rounded-xl cursor-pointer hover:bg-neutral-700 transition-colors relative">
                            <Upload size={20} className={selectedApkName ? "text-green-500" : "text-fox-orange"} />
                            <input 
                              type="file" 
                              name="apkFile"
                              accept=".apk" 
                              className="hidden" 
                              onChange={(e) => setSelectedApkName(e.target.files?.[0]?.name || null)}
                            />
                            {selectedApkName && (
                              <span className="absolute -top-2 -right-2 bg-green-500 text-white text-[8px] px-1.5 py-0.5 rounded-full">✓</span>
                            )}
                          </label>
                        </div>
                        {selectedApkName && <p className="text-[10px] text-green-500 mt-1 mr-2 italic">ملف مختار: {selectedApkName}</p>}
                      </div>

                      <div className="col-span-2">
                        <label className="block text-sm text-neutral-400 mb-2 mr-1">أيقونة / صورة التطبيق (اختياري)</label>
                        <div className="flex gap-2">
                          <div className="flex-1 bg-neutral-950 border border-neutral-800 rounded-xl p-3 text-neutral-500 text-sm flex items-center justify-between">
                             <span>{selectedImageName || 'اختر صورة...'}</span>
                             {selectedImageName && <Check size={16} className="text-green-500" />}
                          </div>
                          <label className="bg-neutral-800 p-3 rounded-xl cursor-pointer hover:bg-neutral-700 transition-colors">
                            <ImageIcon size={20} className="text-fox-orange" />
                            <input 
                              type="file" 
                              name="imageFile"
                              accept="image/*" 
                              className="hidden" 
                              onChange={(e) => setSelectedImageName(e.target.files?.[0]?.name || null)}
                            />
                          </label>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 pt-4">
                      <button 
                        type="submit" 
                        disabled={isUploading}
                        className={`flex-1 btn-primary flex items-center justify-center gap-2 ${isUploading ? 'opacity-70 cursor-not-allowed' : ''}`}
                      >
                        {isUploading ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            جاري الرفع...
                          </>
                        ) : (
                          'حفظ ونشر التطبيق'
                        )}
                      </button>
                      <button type="button" onClick={() => setView('store')} className="flex-1 btn-secondary">إلغاء</button>
                    </div>
                  </form>
              </div>
            </motion.div>
          )}

          {view === 'messages' && (
            <motion.div 
              key="messages"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8"
            >
              <div className="md:col-span-1 space-y-6">
                <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6">
                  <h3 className="text-xl font-bold text-white mb-4">إرسال رسالة</h3>
                  <form onSubmit={handleSendMessage} className="space-y-4">
                    <select name="receiverId" required className="form-input px-2">
                      <option value="">اختر المستلم</option>
                      {users.filter(u => u.id !== currentUser.id && u.role !== 'owner').map(u => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                    </select>
                    <textarea name="text" required placeholder="اكتب رسالتك..." className="form-input min-h-[100px]" />
                    <button type="submit" className="w-full btn-primary flex items-center justify-center gap-2">
                      إرسال
                      <Send size={18} />
                    </button>
                  </form>
                </div>
              </div>

              <div className="md:col-span-2">
                <h3 className="text-2xl font-bold text-white mb-6">الرسائل الواردة</h3>
                <div className="space-y-4">
                  {messages.filter(m => m.receiverId === currentUser.id).length > 0 ? (
                    messages.filter(m => m.receiverId === currentUser.id).map(msg => (
                      <div key={msg.id} className="bg-neutral-900/50 border border-neutral-800 p-5 rounded-2xl">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-bold text-fox-orange">{msg.senderName}</span>
                          <span className="text-xs text-neutral-500">{new Date(msg.timestamp).toLocaleString('ar-EG')}</span>
                        </div>
                        <p className="text-neutral-300 leading-relaxed">{msg.text}</p>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-20 text-neutral-600 bg-neutral-900/20 border border-dashed border-neutral-800 rounded-3xl">
                      صندوق الوارد فارغ حالياً
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {view === 'profile' && (
            <motion.div 
              key="profile"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8"
            >
              <div className="md:col-span-1 space-y-6">
                <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-8 flex flex-col items-center text-center shadow-lg">
                  <div className="w-24 h-24 bg-neutral-800 rounded-full flex items-center justify-center mb-4 border-4 border-fox-orange/20">
                    <User size={48} className="text-fox-orange" />
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-1">{currentUser.name}</h3>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-6 ${
                    currentUser.role === 'owner' ? 'bg-red-500/20 text-red-500' : 
                    currentUser.role === 'developer' ? 'bg-green-500/20 text-green-500' : 'bg-blue-500/20 text-blue-500'
                  }`}>
                    {currentUser.role === 'owner' ? 'المالك' : currentUser.role === 'developer' ? 'مطور' : 'مستخدم'}
                  </span>
                  
                  <div className="grid grid-cols-2 w-full gap-2 border-t border-neutral-800 pt-6">
                    <div className="bg-neutral-950 p-3 rounded-xl">
                      <p className="text-2xl font-bold text-white">{apps.filter(a => a.publisherId === currentUser.id).length}</p>
                      <p className="text-[10px] text-neutral-500 uppercase">تطبيقاتي</p>
                    </div>
                    <div className="bg-neutral-950 p-3 rounded-xl">
                      <p className="text-2xl font-bold text-white">
                        {apps.filter(a => a.publisherId === currentUser.id).reduce((acc, a) => acc + a.likes.length, 0)}
                      </p>
                      <p className="text-[10px] text-neutral-500 uppercase">إعجابات</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="md:col-span-2 space-y-8">
                <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-8 overflow-hidden relative">
                   <div className="absolute top-0 right-0 w-32 h-32 bg-fox-orange/5 blur-3xl rounded-full" />
                   <h3 className="text-xl font-bold text-white mb-6">إعدادات الحساب</h3>
                   <form onSubmit={handleUpdateProfile} className="space-y-5">
                      <div>
                        <label className="block text-sm text-neutral-400 mb-2 mr-1">الاسم المختصر</label>
                        <input name="name" defaultValue={currentUser.name} className="form-input" />
                      </div>
                      <div>
                        <label className="block text-sm text-neutral-400 mb-2 mr-1">كلمة سر جديدة</label>
                        <input name="password" type="password" className="form-input" placeholder="ترك الفارغ لعدم التغيير" />
                      </div>
                      {currentUser.role !== 'owner' && (
                        <div>
                          <label className="block text-sm text-neutral-400 mb-2 mr-1">نوع الحساب</label>
                          <select name="role" defaultValue={currentUser.role} className="form-input">
                            <option value="user">مستخدم عادي</option>
                            <option value="developer">مطور برمجيات</option>
                          </select>
                        </div>
                      )}
                      <button type="submit" className="btn-primary w-fit min-w-[140px]">تعديل البيانات</button>
                   </form>
                </div>

                <div className="space-y-4">
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <ArrowRight className="text-fox-orange" />
                    تطبيقاتي المرفوعة
                  </h3>
                   {apps.filter(a => a.publisherId === currentUser.id).length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {apps.filter(a => a.publisherId === currentUser.id).map(app => (
                        <div key={app.id} className="bg-neutral-900 border border-neutral-800 p-4 rounded-2xl flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-neutral-800 rounded-lg flex items-center justify-center">
                              {app.type === 'apk' ? <FileCode className="text-fox-orange" /> : <ExternalLink className="text-blue-400" />}
                            </div>
                            <div>
                              <p className="font-bold text-sm text-white">{app.name}</p>
                              <p className="text-xs text-neutral-500">{app.downloads} تحميل</p>
                            </div>
                          </div>
                          <button 
                            onClick={() => handleDeleteApp(app.id)}
                            className="p-2 text-neutral-600 hover:text-red-500 transition-colors"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-neutral-500 italic">لم تقم برفع أي تطبيقات حتى الآن.</p>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {view === 'admin' && currentUser.role === 'owner' && (
            <motion.div 
              key="admin"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8"
            >
              <div className="bg-red-500/10 border border-red-500/20 rounded-3xl p-8 flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-bold text-red-500">لوحة التحكم الإدارية</h3>
                  <p className="text-neutral-400 mt-1">إدارة المستخدمين والمحتوى النهائي للمتجر</p>
                </div>
                <div className="bg-red-500 text-white p-3 rounded-2xl shadow-lg ring-4 ring-red-500/10">
                  <Shield size={32} />
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6">
                  <h4 className="text-lg font-bold text-white mb-6 border-b border-neutral-800 pb-4">إدارة المستخدمين</h4>
                  <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                    {users.filter(u => u.email !== OWNER_EMAIL).length > 0 ? (
                      users.filter(u => u.email !== OWNER_EMAIL).map(user => (
                        <div key={user.id} className="bg-neutral-950 p-4 rounded-2xl flex items-center justify-between border border-neutral-800/50">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-neutral-900 rounded-lg flex items-center justify-center border border-neutral-800">
                              <User size={20} className="text-neutral-500" />
                            </div>
                            <div>
                               <p className="font-bold text-white">{user.name}</p>
                               <div className="flex items-center gap-2">
                                <p className="text-xs text-neutral-500">{user.email}</p>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded ${user.role === 'developer' ? 'bg-green-500/10 text-green-500' : 'bg-blue-500/10 text-blue-500'}`}>{user.role}</span>
                               </div>
                            </div>
                          </div>
                          <button 
                            onClick={() => handleDeleteUser(user.id)}
                            className="bg-red-500/10 p-2.5 rounded-xl text-red-500 hover:bg-red-500 hover:text-white transition-all"
                          >
                            <Trash2 size={20} />
                          </button>
                        </div>
                      ))
                    ) : (
                      <p className="text-neutral-600 text-center py-10 italic">لا يوجد مستخدمين آخرين حالياً.</p>
                    )}
                  </div>
                </div>

                <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6">
                  <h4 className="text-lg font-bold text-white mb-6 border-b border-neutral-800 pb-4">إدارة التطبيقات</h4>
                  <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                    {apps.length > 0 ? (
                      apps.map(app => (
                        <div key={app.id} className="bg-neutral-950 p-4 rounded-2xl flex items-center justify-between border border-neutral-800/50">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-neutral-900 rounded-lg flex items-center justify-center">
                              {app.type === 'apk' ? <FileCode size={20} className="text-fox-orange" /> : <ExternalLink size={20} className="text-blue-400" />}
                            </div>
                            <div>
                               <p className="font-bold text-white">{app.name}</p>
                               <p className="text-xs text-neutral-500">بواسطة: {app.publisherName}</p>
                            </div>
                          </div>
                          <button 
                            onClick={() => handleDeleteApp(app.id)}
                            className="bg-red-500/10 p-2.5 rounded-xl text-red-500 hover:bg-red-500 hover:text-white transition-all"
                          >
                            <Trash2 size={20} />
                          </button>
                        </div>
                      ))
                    ) : (
                      <p className="text-neutral-600 text-center py-10 italic">لا توجد تطبيقات نشطة في المتجر.</p>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Global CSS for form elements to keep it clean */}
      <style>{`
        .form-input {
          width: 100%;
          background: #0a0a0a;
          border: 1px solid #262626;
          border-radius: 1rem;
          padding: 0.875rem 1rem;
          color: white;
          transition: all 0.2s;
          text-align: right;
        }
        .form-input:focus {
          outline: none;
          border-color: #f26522;
          background: #111111;
        }
        .btn-primary {
          background: #f26522;
          color: white;
          font-weight: 700;
          padding: 0.875rem 1.5rem;
          border-radius: 1rem;
          transition: all 0.2s;
          box-shadow: 0 4px 15px rgba(242, 101, 34, 0.15);
        }
        .btn-primary:hover {
          opacity: 0.9;
        }
        .btn-secondary {
          background: #262626;
          color: white;
          font-weight: 700;
          padding: 0.875rem 1.5rem;
          border-radius: 1rem;
          transition: all 0.2s;
        }
        .btn-secondary:hover {
          background: #404040;
        }
      `}</style>
    </div>
  );
}

// Sub-components
function NavButton({ active, icon, label, onClick }: { active: boolean, icon: React.ReactNode, label: string, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`flex md:flex-row flex-col items-center gap-3 w-full px-4 py-3 md:py-3.5 rounded-2xl transition-all ${
        active 
          ? 'bg-fox-orange text-white md:bg-fox-orange/10 md:text-fox-orange md:shadow-none shadow-lg shadow-fox-orange/20' 
          : 'text-neutral-500 hover:text-white hover:bg-neutral-800/50'
      }`}
    >
      <div className="shrink-0">{icon}</div>
      <span className="font-bold text-[10px] md:text-sm whitespace-nowrap">{label}</span>
    </button>
  );
}

interface AppCardProps {
  app: AppEntry;
  onLike: () => void;
  onDownload: () => void;
  onDelete: () => void;
  currentUser: UserType;
  hasLiked: boolean;
}

const AppCard: React.FC<AppCardProps> = ({ app, onLike, onDownload, onDelete, currentUser, hasLiked }) => {
  const [showReviews, setShowReviews] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [copied, setCopied] = useState(false);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [userRating, setUserRating] = useState(5);
  const [userComment, setUserComment] = useState('');

  useEffect(() => {
    if (showReviews) {
      const q = query(collection(db, 'apps', app.id, 'reviews'), orderBy('createdAt', 'desc'), limit(10));
      return onSnapshot(q, (s) => setReviews(s.docs.map(d => ({ ...d.data(), id: d.id } as Review))));
    }
  }, [showReviews, app.id]);

  const submitReview = async () => {
    if (!userComment.trim()) return;
    
    // Calculate new stats
    const newCount = (app.reviewCount || 0) + 1;
    const userRatingVal = userRating;
    const userCommentVal = userComment;
    const newAvg = (((app.rating || 0) * (app.reviewCount || 0)) + userRatingVal) / newCount;

    // Optimistic local state update
    const tempReview: Review = {
      id: 'temp-' + Date.now(),
      appId: app.id,
      userId: currentUser.id,
      userName: currentUser.name,
      rating: userRatingVal,
      comment: userCommentVal,
      createdAt: Date.now()
    };
    setReviews(prev => [tempReview, ...prev]);
    setUserComment('');

    try {
      await addDoc(collection(db, 'apps', app.id, 'reviews'), {
        appId: app.id,
        userId: currentUser.id,
        userName: currentUser.name,
        rating: userRatingVal,
        comment: userCommentVal,
        createdAt: Date.now()
      });
      
      await updateDoc(doc(db, 'apps', app.id), {
        rating: newAvg,
        reviewCount: newCount
      });
    } catch (e) {
      console.error("Review submit error:", e);
      // Revert if it fails
      setReviews(prev => prev.filter(r => r.id !== tempReview.id));
      setUserComment(userCommentVal);
      alert('حدث خطأ أثناء إرسال المراجعة');
    }
  };

  const shareUrl = `${window.location.origin}/?app=${app.id}`;
  const shareText = `تحميل تطبيق ${app.name} من متجر ${PROJECT_NAME}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareLinks = [
    { name: 'واتساب', url: `https://wa.me/?text=${encodeURIComponent(shareText + ' ' + shareUrl)}`, color: 'bg-green-600' },
    { name: 'تلجرام', url: `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`, color: 'bg-blue-500' },
    { name: 'فيسبوك', url: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`, color: 'bg-blue-800' }
  ];

  return (
    <motion.div 
      whileHover={{ y: -5 }}
      className="bg-neutral-900 border border-neutral-800 rounded-3xl overflow-hidden group hover:border-fox-orange/30 transition-all flex flex-col h-full"
    >
      <div className="h-48 bg-neutral-950 relative flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-fox-orange/10 to-transparent group-hover:from-fox-orange/20 transition-all" />
        {app.imageUrl ? (
          <img 
            src={app.imageUrl} 
            alt={app.name} 
            className="w-full h-full object-cover z-10"
            referrerPolicy="no-referrer"
            loading="lazy"
          />
        ) : (
          app.type === 'apk' ? (
            <FileCode size={64} className="text-fox-orange z-10" />
          ) : (
            <ExternalLink size={64} className="text-blue-400 z-10" />
          )
        )}
        <div className="absolute top-4 left-4 z-20">
          <span className="px-3 py-1 bg-black/50 backdrop-blur-md rounded-full text-[10px] font-bold text-white uppercase tracking-wider">
            {app.category}
          </span>
        </div>
      </div>

      <div className="p-6 flex flex-col flex-1">
        <div className="flex items-start justify-between mb-2">
          <h3 className="text-xl font-bold text-white line-clamp-1">{app.name}</h3>
          <div className="flex items-center gap-1 text-yellow-500">
             <Star size={14} fill="currentColor" />
             <span className="text-sm font-bold">{app.rating?.toFixed(1) || '0.0'}</span>
          </div>
        </div>
        
        <p className="text-neutral-500 text-sm mb-4 line-clamp-2 h-10">{app.description}</p>
        
        <div className="flex items-center justify-between mt-auto pt-4 border-t border-neutral-800">
          <div className="flex items-center gap-4">
            <button 
              onClick={onLike}
              className={`flex items-center gap-1.5 transition-colors ${hasLiked ? 'text-fox-orange' : 'text-neutral-500 hover:text-fox-orange'}`}
            >
              <Heart size={18} fill={hasLiked ? "currentColor" : "none"} />
              <span className="text-xs font-bold">{app.likes.length}</span>
            </button>
            <div className="flex items-center gap-1.5 text-neutral-500">
              <Download size={18} />
              <span className="text-xs font-bold">{app.downloads}</span>
            </div>
            <button 
              onClick={() => setShowReviews(!showReviews)}
              className="flex items-center gap-1.5 text-neutral-500 hover:text-white transition-colors"
            >
              <MessageCircle size={18} />
              <span className="text-xs font-bold">{app.reviewCount || 0}</span>
            </button>
            <button 
              onClick={() => setShowShare(!showShare)}
              className="flex items-center gap-1.5 text-neutral-500 hover:text-fox-orange transition-colors"
            >
              <Share2 size={18} />
            </button>
          </div>
          
          <div className="flex items-center gap-2">
            {(currentUser.role === 'owner' || app.publisherId === currentUser.id) && (
              <button 
                onClick={onDelete}
                className="p-2 text-neutral-600 hover:text-red-500 hover:bg-neutral-800 rounded-xl transition-all"
              >
                <Trash2 size={18} />
              </button>
            )}
            <button 
              onClick={onDownload}
              className="bg-fox-orange p-2.5 rounded-xl text-white hover:opacity-90 transition-all shadow-lg shadow-fox-orange/20"
            >
              {app.type === 'apk' ? <Download size={20} /> : <ExternalLink size={20} />}
            </button>
          </div>
        </div>

        {showShare && (
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="mt-4 pt-4 border-t border-neutral-800"
          >
            <p className="text-xs text-neutral-400 mb-3 font-bold">مشاركة التطبيق:</p>
            <div className="flex flex-wrap gap-2 mb-4">
              {shareLinks.map(link => (
                <a 
                  key={link.name} 
                  href={link.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className={`${link.color} text-white px-3 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1 hover:opacity-90 transition-opacity`}
                >
                  {link.name}
                </a>
              ))}
            </div>
            <div className="flex bg-neutral-950 border border-neutral-800 rounded-xl overflow-hidden">
               <input 
                 readOnly 
                 value={shareUrl} 
                 className="bg-transparent border-none text-[10px] text-neutral-500 px-3 py-2 flex-1 outline-none"
               />
               <button 
                 onClick={handleCopy}
                 className="bg-neutral-800 px-3 hover:bg-neutral-700 transition-colors"
               >
                 {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} className="text-neutral-400" />}
               </button>
            </div>
          </motion.div>
        )}

        {showReviews && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            className="mt-4 pt-4 border-t border-neutral-800"
          >
            <div className="space-y-3 mb-4 max-h-40 overflow-y-auto px-1">
              {reviews.map(r => (
                <div key={r.id} className="bg-neutral-950 p-3 rounded-xl border border-neutral-800">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-bold text-fox-orange">{r.userName}</span>
                    <div className="flex text-yellow-500">
                      {[...Array(5)].map((_, i) => <Star key={i} size={10} fill={i < r.rating ? "currentColor" : "none"} />)}
                    </div>
                  </div>
                  <p className="text-xs text-neutral-400">{r.comment}</p>
                </div>
              ))}
            </div>
            
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 mb-1">
                {[1,2,3,4,5].map(n => (
                  <button key={n} onClick={() => setUserRating(n)} className={`${userRating >= n ? 'text-yellow-500' : 'text-neutral-700'} hover:scale-110 transition-transform`}>
                    <Star size={16} fill={userRating >= n ? "currentColor" : "none"} />
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input 
                  value={userComment} 
                  onChange={e => setUserComment(e.target.value)}
                  placeholder="أضف تعليقك..." 
                  className="bg-neutral-950 border border-neutral-800 rounded-lg p-2 text-xs flex-1 text-white focus:border-fox-orange"
                />
                <button onClick={submitReview} className="bg-fox-orange p-2 rounded-lg text-white">
                  <Send size={14} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
