import React, { useState, useEffect, useMemo } from 'react';
import { 
  auth, 
  db, 
  googleProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged,
  collection, 
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  getDoc,
  onSnapshot, 
  query, 
  orderBy, 
  limit, 
  addDoc, 
  serverTimestamp,
  Timestamp
} from './firebase';
import { 
  Plus, 
  Minus, 
  Package, 
  History, 
  LayoutDashboard, 
  LogOut, 
  LogIn, 
  Search, 
  ArrowUpCircle, 
  ArrowDownCircle, 
  Trash2, 
  Edit3,
  X,
  TrendingUp,
  DollarSign,
  AlertCircle,
  Users,
  ShieldCheck
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Utility for Tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
interface Part {
  id: string;
  name: string;
  model: string;
  quantity: number;
  unitPrice: number;
  totalValue: number;
  stockId: string;
  updatedAt: any;
  createdBy: string;
}

interface Transaction {
  id: string;
  partId: string;
  partName: string;
  type: 'entry' | 'exit';
  quantity: number;
  unitPrice: number;
  stockId: string;
  timestamp: any;
  createdBy: string;
}

interface Stock {
  id: string;
  name: string;
  createdAt: any;
  createdBy: string;
}

interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  photoURL: string;
  role: 'admin' | 'user';
  permissions: {
    canManageStocks: boolean;
    canManageParts: boolean;
    canViewHistory: boolean;
    canPerformTransactions: boolean;
  };
  createdAt: any;
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

// --- Error Handling ---
function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  // We'll show a toast or alert in the UI
  return errInfo;
}

// --- Components ---

const Modal = ({ isOpen, onClose, title, children }: { isOpen: boolean, onClose: () => void, title: string, children: React.ReactNode }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h3 className="text-xl font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={24} />
          </button>
        </div>
        <div className="p-6">
          {children}
        </div>
      </div>
    </div>
  );
};

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [parts, setParts] = useState<Part[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'inventory' | 'history' | 'overview' | 'users'>('dashboard');
  const [activeStockId, setActiveStockId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAddStockModalOpen, setIsAddStockModalOpen] = useState(false);
  const [isMovementModalOpen, setIsMovementModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedPart, setSelectedPart] = useState<Part | null>(null);
  const [partToDelete, setPartToDelete] = useState<Part | null>(null);
  const [movementError, setMovementError] = useState<string | null>(null);
  const [movementType, setMovementType] = useState<'entry' | 'exit'>('entry');

  // Form States
  const [newPart, setNewPart] = useState({ name: '', model: '', quantity: 0, unitPrice: 0 });
  const [newStockName, setNewStockName] = useState('');
  const [movementAmount, setMovementAmount] = useState(1);
  const [movementPrice, setMovementPrice] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // --- Auth ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Ensure user profile exists
        const userDocRef = doc(db, 'users', currentUser.uid);
        try {
          const userDoc = await getDoc(userDocRef);
          if (!userDoc.exists()) {
            const isDefaultAdmin = currentUser.email === "luiz.ferigato@okamed.com.br";
            const newProfile = {
              email: currentUser.email || '',
              displayName: currentUser.displayName || '',
              photoURL: currentUser.photoURL || '',
              role: isDefaultAdmin ? 'admin' : 'user',
              permissions: {
                canManageStocks: isDefaultAdmin,
                canManageParts: isDefaultAdmin,
                canViewHistory: true,
                canPerformTransactions: true
              },
              createdAt: serverTimestamp()
            };
            await setDoc(userDocRef, newProfile);
            setCurrentUserProfile({ id: currentUser.uid, ...newProfile } as UserProfile);
          } else {
            const data = userDoc.data();
            const isDefaultAdmin = currentUser.email === "luiz.ferigato@okamed.com.br";
            
            // Auto-upgrade default admin if needed
            if (isDefaultAdmin && (data.role !== 'admin' || !data.permissions)) {
              const updatedProfile = {
                ...data,
                role: 'admin',
                permissions: {
                  canManageStocks: true,
                  canManageParts: true,
                  canViewHistory: true,
                  canPerformTransactions: true
                }
              };
              await updateDoc(userDocRef, updatedProfile);
              setCurrentUserProfile({ id: currentUser.uid, ...updatedProfile } as UserProfile);
            } else {
              setCurrentUserProfile({ id: currentUser.uid, ...data } as UserProfile);
            }
          }
        } catch (error) {
          console.error("Error fetching/creating user profile:", error);
        }
      } else {
        setCurrentUserProfile(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login Error:", error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout Error:", error);
    }
  };

  // --- Data Fetching ---
  useEffect(() => {
    if (!user) return;

    // Fetch users if admin
    let unsubscribeUsers = () => {};
    if (currentUserProfile?.role === 'admin') {
      const usersQuery = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
      unsubscribeUsers = onSnapshot(usersQuery, (snapshot) => {
        const usersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserProfile));
        setUsersList(usersData);
      }, (error) => handleFirestoreError(error, OperationType.LIST, 'users'));
    }

    const stocksQuery = query(collection(db, 'stocks'), orderBy('createdAt', 'asc'));
    const unsubscribeStocks = onSnapshot(stocksQuery, (snapshot) => {
      const stocksData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Stock));
      setStocks(stocksData);
      // Set first stock as active if none selected
      if (stocksData.length > 0 && !activeStockId && activeTab !== 'overview') {
        setActiveStockId(stocksData[0].id);
      }
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'stocks'));

    const partsQuery = query(collection(db, 'parts'), orderBy('updatedAt', 'desc'));
    const unsubscribeParts = onSnapshot(partsQuery, (snapshot) => {
      const partsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Part));
      setParts(partsData);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'parts'));

    const transactionsQuery = query(collection(db, 'transactions'), orderBy('timestamp', 'desc'), limit(50));
    const unsubscribeTransactions = onSnapshot(transactionsQuery, (snapshot) => {
      const transactionsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction));
      setTransactions(transactionsData);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'transactions'));

    return () => {
      unsubscribeUsers();
      unsubscribeStocks();
      unsubscribeParts();
      unsubscribeTransactions();
    };
  }, [user, currentUserProfile]);

  // --- Actions ---
  const handleAddStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newStockName.trim() || isSubmitting) {
      console.log('Validation failed or already submitting:', { user: !!user, newStockName: newStockName.trim(), isSubmitting });
      return;
    }

    setIsSubmitting(true);
    console.log('Attempting to create stock:', newStockName);
    try {
      const docRef = await addDoc(collection(db, 'stocks'), {
        name: newStockName,
        createdAt: serverTimestamp(),
        createdBy: user.uid
      });
      console.log('Stock created successfully:', docRef.id);
      setActiveStockId(docRef.id);
      setIsAddStockModalOpen(false);
      setNewStockName('');
      setActiveTab('dashboard');
    } catch (error) {
      console.error('Error creating stock:', error);
      handleFirestoreError(error, OperationType.WRITE, 'stocks');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddPart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !activeStockId || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const totalValue = newPart.quantity * newPart.unitPrice;
      const partData = {
        ...newPart,
        totalValue,
        stockId: activeStockId,
        updatedAt: serverTimestamp(),
        createdBy: user.uid
      };
      
      const docRef = await addDoc(collection(db, 'parts'), partData);
      
      // Create initial transaction
      await addDoc(collection(db, 'transactions'), {
        partId: docRef.id,
        partName: newPart.name,
        type: 'entry',
        quantity: newPart.quantity,
        unitPrice: newPart.unitPrice,
        stockId: activeStockId,
        timestamp: serverTimestamp(),
        createdBy: user.uid
      });

      setIsAddModalOpen(false);
      setNewPart({ name: '', model: '', quantity: 0, unitPrice: 0 });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'parts');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedPart || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const newQuantity = movementType === 'entry' 
        ? selectedPart.quantity + movementAmount 
        : selectedPart.quantity - movementAmount;

      if (newQuantity < 0) {
        setMovementError("Estoque insuficiente!");
        setIsSubmitting(false);
        return;
      }
      setMovementError(null);

      const partRef = doc(db, 'parts', selectedPart.id);
      await updateDoc(partRef, {
        quantity: newQuantity,
        unitPrice: movementPrice || selectedPart.unitPrice,
        totalValue: newQuantity * (movementPrice || selectedPart.unitPrice),
        updatedAt: serverTimestamp()
      });

      await addDoc(collection(db, 'transactions'), {
        partId: selectedPart.id,
        partName: selectedPart.name,
        type: movementType,
        quantity: movementAmount,
        unitPrice: movementPrice || selectedPart.unitPrice,
        stockId: selectedPart.stockId,
        timestamp: serverTimestamp(),
        createdBy: user.uid
      });

      setIsMovementModalOpen(false);
      setSelectedPart(null);
      setMovementAmount(1);
      setMovementPrice(0);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `parts/${selectedPart?.id}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeletePart = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'parts', id));
      setIsDeleteModalOpen(false);
      setPartToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `parts/${id}`);
    }
  };

  const handleUpdateUserRole = async (userId: string, newRole: 'admin' | 'user') => {
    if (!user || currentUserProfile?.role !== 'admin') return;
    try {
      const userToUpdate = usersList.find(u => u.id === userId);
      if (!userToUpdate) return;

      await updateDoc(doc(db, 'users', userId), { 
        role: newRole,
        // If promoted to admin, give all permissions
        ...(newRole === 'admin' ? {
          permissions: {
            canManageStocks: true,
            canManageParts: true,
            canViewHistory: true,
            canPerformTransactions: true
          }
        } : {})
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
    }
  };

  const handleUpdateUserPermission = async (userId: string, permission: keyof UserProfile['permissions'], value: boolean) => {
    if (!user || currentUserProfile?.role !== 'admin') return;
    try {
      const userToUpdate = usersList.find(u => u.id === userId);
      if (!userToUpdate) return;

      await updateDoc(doc(db, 'users', userId), {
        [`permissions.${permission}`]: value
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!user || currentUserProfile?.role !== 'admin') return;
    if (userId === user.uid) {
      alert("Você não pode excluir seu próprio usuário!");
      return;
    }
    try {
      await deleteDoc(doc(db, 'users', userId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `users/${userId}`);
    }
  };

  // --- Computed Stats ---
  const filteredParts = useMemo(() => {
    return parts.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           p.model.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStock = activeTab === 'overview' ? true : p.stockId === activeStockId;
      return matchesSearch && matchesStock;
    });
  }, [parts, searchTerm, activeStockId, activeTab]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      return activeTab === 'overview' ? true : t.stockId === activeStockId;
    });
  }, [transactions, activeStockId, activeTab]);

  const stats = useMemo(() => {
    const relevantParts = activeTab === 'overview' ? parts : parts.filter(p => p.stockId === activeStockId);
    const totalItems = relevantParts.length;
    const totalStock = relevantParts.reduce((acc, p) => acc + p.quantity, 0);
    const totalValue = relevantParts.reduce((acc, p) => acc + p.totalValue, 0);
    const lowStock = relevantParts.filter(p => p.quantity < 5).length;

    return { totalItems, totalStock, totalValue, lowStock };
  }, [parts, activeStockId, activeTab]);

  const chartData = useMemo(() => {
    const relevantParts = activeTab === 'overview' ? parts : parts.filter(p => p.stockId === activeStockId);
    return relevantParts
      .sort((a, b) => b.totalValue - a.totalValue)
      .slice(0, 5)
      .map(p => ({
        name: p.name,
        valor: p.totalValue
      }));
  }, [parts, activeStockId, activeTab]);

  const overviewStats = useMemo(() => {
    return stocks.map(stock => {
      const stockParts = parts.filter(p => p.stockId === stock.id);
      return {
        id: stock.id,
        name: stock.name,
        totalItems: stockParts.length,
        totalStock: stockParts.reduce((acc, p) => acc + p.quantity, 0),
        totalValue: stockParts.reduce((acc, p) => acc + p.totalValue, 0)
      };
    });
  }, [stocks, parts]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-md bg-white rounded-3xl shadow-xl p-8 text-center">
          <div className="bg-orange-100 w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Package className="text-orange-600" size={40} />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Estoque Online</h1>
          <p className="text-gray-500 mb-8">Faça login para gerenciar seu estoque de peças com precisão.</p>
          <button 
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-3 bg-orange-500 hover:bg-orange-600 text-white font-semibold py-4 px-6 rounded-2xl transition-all shadow-lg shadow-orange-200"
          >
            <LogIn size={20} />
            Entrar com Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-6 flex items-center gap-3 border-b border-gray-100">
          <div className="bg-orange-500 p-2 rounded-lg">
            <Package className="text-white" size={24} />
          </div>
          <span className="font-bold text-xl text-gray-900">StockMaster</span>
        </div>
        
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          <button 
            onClick={() => { setActiveTab('overview'); setActiveStockId(null); }}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium",
              activeTab === 'overview' ? "bg-orange-50 text-orange-600" : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
            )}
          >
            <TrendingUp size={20} />
            Visão Geral
          </button>
          
          <div className="pt-4 pb-2 px-4 text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center justify-between">
            Estoques
            {(currentUserProfile?.role === 'admin' || currentUserProfile?.permissions?.canManageStocks) && (
              <button 
                onClick={() => setIsAddStockModalOpen(true)}
                className="p-1 hover:bg-gray-100 rounded-md text-orange-500"
              >
                <Plus size={14} />
              </button>
            )}
          </div>

          {stocks.map(stock => (
            <button 
              key={stock.id}
              onClick={() => { setActiveStockId(stock.id); if (activeTab === 'overview') setActiveTab('dashboard'); }}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-2 rounded-xl transition-all text-sm font-medium",
                activeStockId === stock.id ? "bg-orange-50 text-orange-600" : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
              )}
            >
              <Package size={16} />
              <span className="truncate">{stock.name}</span>
            </button>
          ))}

          <div className="pt-4 pb-2 px-4 text-xs font-bold text-gray-400 uppercase tracking-wider">
            Menu
          </div>

          <button 
            onClick={() => setActiveTab('dashboard')}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium",
              activeTab === 'dashboard' ? "bg-orange-50 text-orange-600" : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
            )}
          >
            <LayoutDashboard size={20} />
            Dashboard
          </button>
          <button 
            onClick={() => setActiveTab('inventory')}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium",
              activeTab === 'inventory' ? "bg-orange-50 text-orange-600" : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
            )}
          >
            <Package size={20} />
            Inventário
          </button>
          {(currentUserProfile?.role === 'admin' || currentUserProfile?.permissions?.canViewHistory) && (
            <button 
              onClick={() => setActiveTab('history')}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium",
                activeTab === 'history' ? "bg-orange-50 text-orange-600" : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
              )}
            >
              <History size={20} />
              Histórico
            </button>
          )}

          {currentUserProfile?.role === 'admin' && (
            <button 
              onClick={() => setActiveTab('users')}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium",
                activeTab === 'users' ? "bg-orange-50 text-orange-600" : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
              )}
            >
              <Users size={20} />
              Usuários
            </button>
          )}
        </nav>

        <div className="p-4 border-t border-gray-100">
          <div className="flex items-center gap-3 mb-4 px-2">
            <img src={user.photoURL} alt={user.displayName} className="w-10 h-10 rounded-full border-2 border-orange-100" referrerPolicy="no-referrer" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1">
                <p className="text-sm font-semibold text-gray-900 truncate">{user.displayName}</p>
                {currentUserProfile?.role === 'admin' && <ShieldCheck size={12} className="text-orange-500" />}
              </div>
              <p className="text-xs text-gray-500 truncate">{user.email}</p>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <LogOut size={16} />
            Sair
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-4 md:p-8">
        {activeTab === 'overview' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <header>
              <h2 className="text-3xl font-bold text-gray-900">Visão Geral</h2>
              <p className="text-gray-500">Consolidado de todos os seus estoques.</p>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                <p className="text-gray-500 text-sm font-medium">Unidades de Estoque</p>
                <h3 className="text-2xl font-bold text-gray-900">{stocks.length}</h3>
              </div>
              <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                <p className="text-gray-500 text-sm font-medium">Total de Peças (Global)</p>
                <h3 className="text-2xl font-bold text-gray-900">{parts.length}</h3>
              </div>
              <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                <p className="text-gray-500 text-sm font-medium">Valor Total (Global)</p>
                <h3 className="text-2xl font-bold text-gray-900">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(parts.reduce((acc, p) => acc + p.totalValue, 0))}
                </h3>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6">
              {overviewStats.map(stock => (
                <div key={stock.id} className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h4 className="text-lg font-bold text-gray-900">{stock.name}</h4>
                    <p className="text-sm text-gray-500">{stock.totalItems} tipos de peças</p>
                  </div>
                  <div className="flex gap-8">
                    <div className="text-center">
                      <p className="text-xs text-gray-400 uppercase font-bold">Qtd. Total</p>
                      <p className="font-bold text-gray-900">{stock.totalStock}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-gray-400 uppercase font-bold">Valor</p>
                      <p className="font-bold text-orange-600">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stock.totalValue)}
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={() => { setActiveStockId(stock.id); setActiveTab('dashboard'); }}
                    className="px-4 py-2 bg-orange-50 text-orange-600 rounded-xl text-sm font-bold hover:bg-orange-100 transition-colors"
                  >
                    Ver Detalhes
                  </button>
                </div>
              ))}
              {stocks.length === 0 && (
                <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-gray-200">
                  <p className="text-gray-400">Nenhum estoque secundário criado.</p>
                  <button 
                    onClick={() => setIsAddStockModalOpen(true)}
                    className="mt-4 text-orange-500 font-bold hover:underline"
                  >
                    Criar meu primeiro estoque
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'dashboard' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <header className="flex items-center justify-between">
              <div>
                <h2 className="text-3xl font-bold text-gray-900">
                  {activeStockId ? stocks.find(s => s.id === activeStockId)?.name : 'Dashboard'}
                </h2>
                <p className="text-gray-500">Resumo do estoque selecionado.</p>
              </div>
            </header>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                <div className="bg-blue-50 w-12 h-12 rounded-2xl flex items-center justify-center mb-4">
                  <Package className="text-blue-600" size={24} />
                </div>
                <p className="text-gray-500 text-sm font-medium">Total de Peças</p>
                <h3 className="text-2xl font-bold text-gray-900">{stats.totalItems}</h3>
              </div>
              <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                <div className="bg-green-50 w-12 h-12 rounded-2xl flex items-center justify-center mb-4">
                  <TrendingUp className="text-green-600" size={24} />
                </div>
                <p className="text-gray-500 text-sm font-medium">Quantidade em Estoque</p>
                <h3 className="text-2xl font-bold text-gray-900">{stats.totalStock}</h3>
              </div>
              <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                <div className="bg-orange-50 w-12 h-12 rounded-2xl flex items-center justify-center mb-4">
                  <DollarSign className="text-orange-600" size={24} />
                </div>
                <p className="text-gray-500 text-sm font-medium">Valor Total</p>
                <h3 className="text-2xl font-bold text-gray-900">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats.totalValue)}
                </h3>
              </div>
              <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                <div className="bg-red-50 w-12 h-12 rounded-2xl flex items-center justify-center mb-4">
                  <AlertCircle className="text-red-600" size={24} />
                </div>
                <p className="text-gray-500 text-sm font-medium">Estoque Baixo</p>
                <h3 className="text-2xl font-bold text-gray-900">{stats.lowStock}</h3>
              </div>
            </div>

            {/* Charts & Recent Activity */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
                <h3 className="text-lg font-bold text-gray-900 mb-6">Top 5 Peças por Valor</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9ca3af' }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9ca3af' }} />
                      <Tooltip 
                        cursor={{ fill: '#f9fafb' }}
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                      />
                      <Bar dataKey="valor" radius={[4, 4, 0, 0]}>
                        {chartData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={['#f97316', '#fb923c', '#fdba74', '#fed7aa', '#ffedd5'][index % 5]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {(currentUserProfile?.role === 'admin' || currentUserProfile?.permissions?.canViewHistory) && (
                <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
                  <h3 className="text-lg font-bold text-gray-900 mb-6">Atividade Recente</h3>
                  <div className="space-y-6">
                    {transactions.slice(0, 5).map((t) => (
                      <div key={t.id} className="flex items-center gap-4">
                        <div className={cn(
                          "w-10 h-10 rounded-full flex items-center justify-center shrink-0",
                          t.type === 'entry' ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"
                        )}>
                          {t.type === 'entry' ? <ArrowUpCircle size={20} /> : <ArrowDownCircle size={20} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">{t.partName}</p>
                          <p className="text-xs text-gray-500">
                            {t.type === 'entry' ? 'Entrada' : 'Saída'} de {t.quantity} unidades
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-medium text-gray-400">
                            {t.timestamp ? format(t.timestamp.toDate(), 'HH:mm', { locale: ptBR }) : '...'}
                          </p>
                        </div>
                      </div>
                    ))}
                    {transactions.length === 0 && (
                      <div className="text-center py-8 text-gray-400">Nenhuma atividade registrada.</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'inventory' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-3xl font-bold text-gray-900">Inventário</h2>
                <p className="text-gray-500">Gerencie suas peças e controle o estoque.</p>
              </div>
              {(currentUserProfile?.role === 'admin' || currentUserProfile?.permissions?.canManageParts) && (
                <button 
                  onClick={() => setIsAddModalOpen(true)}
                  className="flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3 px-6 rounded-2xl transition-all shadow-lg shadow-orange-200"
                >
                  <Plus size={20} />
                  Nova Peça
                </button>
              )}
            </header>

            {/* Search & Filter */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-3">
              <Search className="text-gray-400" size={20} />
              <input 
                type="text" 
                placeholder="Buscar por nome ou modelo..." 
                className="flex-1 bg-transparent border-none focus:ring-0 text-gray-900 placeholder:text-gray-400"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {/* Inventory Table */}
            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Peça</th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Modelo</th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider text-center">Qtd</th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Preço Unit.</th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Valor Total</th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filteredParts.map((part) => (
                      <tr key={part.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <span className="font-semibold text-gray-900">{part.name}</span>
                        </td>
                        <td className="px-6 py-4 text-gray-500">{part.model}</td>
                        <td className="px-6 py-4 text-center">
                          <span className={cn(
                            "px-3 py-1 rounded-full text-xs font-bold",
                            part.quantity < 5 ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600"
                          )}>
                            {part.quantity}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-gray-900 font-medium">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(part.unitPrice)}
                        </td>
                        <td className="px-6 py-4 text-gray-900 font-bold">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(part.totalValue)}
                        </td>
                        <td className="px-6 py-4 text-right space-x-2">
                          {(currentUserProfile?.role === 'admin' || currentUserProfile?.permissions?.canPerformTransactions) && (
                            <>
                              <button 
                                onClick={() => {
                                  setSelectedPart(part);
                                  setMovementType('entry');
                                  setMovementPrice(part.unitPrice);
                                  setIsMovementModalOpen(true);
                                }}
                                title="Entrada"
                                className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                              >
                                <Plus size={18} />
                              </button>
                              <button 
                                onClick={() => {
                                  setSelectedPart(part);
                                  setMovementType('exit');
                                  setMovementPrice(part.unitPrice);
                                  setIsMovementModalOpen(true);
                                }}
                                title="Saída"
                                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              >
                                <Minus size={18} />
                              </button>
                            </>
                          )}
                          {(currentUserProfile?.role === 'admin' || currentUserProfile?.permissions?.canManageParts) && (
                            <button 
                              onClick={() => {
                                setPartToDelete(part);
                                setIsDeleteModalOpen(true);
                              }}
                              title="Excluir"
                              className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            >
                              <Trash2 size={18} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {filteredParts.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                          Nenhuma peça encontrada.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <header>
              <h2 className="text-3xl font-bold text-gray-900">Histórico</h2>
              <p className="text-gray-500">Registro completo de todas as movimentações de estoque.</p>
            </header>

            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Data/Hora</th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Peça</th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Estoque</th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Tipo</th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider text-center">Qtd</th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Preço Unit.</th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filteredTransactions.map((t) => (
                      <tr key={t.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-4 text-sm text-gray-500">
                          {t.timestamp ? format(t.timestamp.toDate(), 'dd/MM/yyyy HH:mm', { locale: ptBR }) : '...'}
                        </td>
                        <td className="px-6 py-4 font-semibold text-gray-900">{t.partName}</td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                          {stocks.find(s => s.id === t.stockId)?.name || '...'}
                        </td>
                        <td className="px-6 py-4">
                          <span className={cn(
                            "inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold",
                            t.type === 'entry' ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"
                          )}>
                            {t.type === 'entry' ? <ArrowUpCircle size={14} /> : <ArrowDownCircle size={14} />}
                            {t.type === 'entry' ? 'Entrada' : 'Saída'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center font-bold text-gray-900">{t.quantity}</td>
                        <td className="px-6 py-4 text-gray-500">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(t.unitPrice)}
                        </td>
                        <td className="px-6 py-4 text-gray-900 font-bold">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(t.quantity * t.unitPrice)}
                        </td>
                      </tr>
                    ))}
                    {filteredTransactions.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-6 py-12 text-center text-gray-400">
                          Nenhuma movimentação registrada.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'users' && currentUserProfile?.role === 'admin' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <header>
              <h2 className="text-3xl font-bold text-gray-900">Gerenciamento de Usuários</h2>
              <p className="text-gray-500">Visualize e gerencie as permissões de acesso ao sistema.</p>
            </header>

            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Usuário</th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Email</th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Função</th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Permissões</th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Data de Cadastro</th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {usersList.map((u) => (
                      <tr key={u.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <img src={u.photoURL} alt={u.displayName} className="w-8 h-8 rounded-full border border-gray-100" referrerPolicy="no-referrer" />
                            <span className="font-semibold text-gray-900">{u.displayName}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">{u.email}</td>
                        <td className="px-6 py-4">
                          <span className={cn(
                            "inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold",
                            u.role === 'admin' ? "bg-purple-50 text-purple-600" : "bg-blue-50 text-blue-600"
                          )}>
                            {u.role === 'admin' ? <ShieldCheck size={14} /> : <Users size={14} />}
                            {u.role === 'admin' ? 'Administrador' : 'Usuário'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-2">
                            <label className="flex items-center gap-1 text-[10px] bg-gray-50 px-2 py-1 rounded border border-gray-100 cursor-pointer hover:bg-gray-100">
                              <input 
                                type="checkbox" 
                                checked={u.permissions?.canManageStocks} 
                                onChange={(e) => handleUpdateUserPermission(u.id, 'canManageStocks', e.target.checked)}
                                disabled={u.role === 'admin'}
                              />
                              Estoques
                            </label>
                            <label className="flex items-center gap-1 text-[10px] bg-gray-50 px-2 py-1 rounded border border-gray-100 cursor-pointer hover:bg-gray-100">
                              <input 
                                type="checkbox" 
                                checked={u.permissions?.canManageParts} 
                                onChange={(e) => handleUpdateUserPermission(u.id, 'canManageParts', e.target.checked)}
                                disabled={u.role === 'admin'}
                              />
                              Peças
                            </label>
                            <label className="flex items-center gap-1 text-[10px] bg-gray-50 px-2 py-1 rounded border border-gray-100 cursor-pointer hover:bg-gray-100">
                              <input 
                                type="checkbox" 
                                checked={u.permissions?.canViewHistory} 
                                onChange={(e) => handleUpdateUserPermission(u.id, 'canViewHistory', e.target.checked)}
                                disabled={u.role === 'admin'}
                              />
                              Histórico
                            </label>
                            <label className="flex items-center gap-1 text-[10px] bg-gray-50 px-2 py-1 rounded border border-gray-100 cursor-pointer hover:bg-gray-100">
                              <input 
                                type="checkbox" 
                                checked={u.permissions?.canPerformTransactions} 
                                onChange={(e) => handleUpdateUserPermission(u.id, 'canPerformTransactions', e.target.checked)}
                                disabled={u.role === 'admin'}
                              />
                              Transações
                            </label>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                          {u.createdAt ? format(u.createdAt.toDate(), 'dd/MM/yyyy', { locale: ptBR }) : '...'}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            <select 
                              className="text-xs border border-gray-200 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-orange-500"
                              value={u.role}
                              onChange={(e) => handleUpdateUserRole(u.id, e.target.value as 'admin' | 'user')}
                              disabled={u.id === user.uid}
                            >
                              <option value="user">Usuário</option>
                              <option value="admin">Admin</option>
                            </select>
                            <button 
                              onClick={() => handleDeleteUser(u.id)}
                              className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              disabled={u.id === user.uid}
                              title="Excluir Usuário"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {usersList.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                          Nenhum outro usuário encontrado.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Modals */}
      <Modal 
        isOpen={isAddStockModalOpen} 
        onClose={() => setIsAddStockModalOpen(false)} 
        title="Novo Estoque"
      >
        <form onSubmit={handleAddStock} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome da Unidade/Estoque</label>
            <input 
              required
              type="text" 
              placeholder="Ex: Almoxarifado Central, Loja 02..."
              className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
              value={newStockName}
              onChange={(e) => setNewStockName(e.target.value)}
            />
          </div>
          <button 
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-orange-100 mt-4"
          >
            {isSubmitting ? 'Criando...' : 'Criar Estoque'}
          </button>
        </form>
      </Modal>

      <Modal 
        isOpen={isAddModalOpen} 
        onClose={() => setIsAddModalOpen(false)} 
        title={`Cadastrar Peça em ${stocks.find(s => s.id === activeStockId)?.name || '...'}`}
      >
        <form onSubmit={handleAddPart} className="space-y-4">
          {!activeStockId && (
            <div className="bg-orange-50 p-4 rounded-xl text-sm text-orange-700 flex items-center gap-2 mb-4">
              <AlertCircle size={16} />
              Selecione um estoque na barra lateral antes de cadastrar.
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome da Peça</label>
            <input 
              required
              type="text" 
              className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
              value={newPart.name}
              onChange={(e) => setNewPart({ ...newPart, name: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Modelo/Referência</label>
            <input 
              required
              type="text" 
              className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
              value={newPart.model}
              onChange={(e) => setNewPart({ ...newPart, model: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Qtd. Inicial</label>
              <input 
                required
                type="number" 
                min="0"
                className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                value={newPart.quantity}
                onChange={(e) => setNewPart({ ...newPart, quantity: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Preço Unitário</label>
              <input 
                required
                type="number" 
                step="0.01"
                min="0"
                className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                value={newPart.unitPrice}
                onChange={(e) => setNewPart({ ...newPart, unitPrice: parseFloat(e.target.value) || 0 })}
              />
            </div>
          </div>
          <button 
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-orange-100 mt-4"
          >
            {isSubmitting ? 'Cadastrando...' : 'Cadastrar Peça'}
          </button>
        </form>
      </Modal>

      <Modal 
        isOpen={isMovementModalOpen} 
        onClose={() => setIsMovementModalOpen(false)} 
        title={movementType === 'entry' ? "Registrar Entrada" : "Registrar Saída"}
      >
        <form onSubmit={handleMovement} className="space-y-4">
          <div className="bg-gray-50 p-4 rounded-2xl mb-4">
            <p className="text-xs text-gray-500 uppercase font-bold mb-1">Peça Selecionada</p>
            <p className="font-bold text-gray-900">{selectedPart?.name}</p>
            <p className="text-sm text-gray-500">{selectedPart?.model}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Quantidade</label>
            <input 
              required
              type="number" 
              min="1"
              className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
              value={movementAmount}
              onChange={(e) => setMovementAmount(parseInt(e.target.value) || 1)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Preço Unitário (Opcional)</label>
            <input 
              type="number" 
              step="0.01"
              min="0"
              placeholder={selectedPart?.unitPrice.toString()}
              className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
              value={movementPrice}
              onChange={(e) => setMovementPrice(parseFloat(e.target.value) || 0)}
            />
            <p className="text-xs text-gray-400 mt-1">Deixe 0 para manter o preço atual.</p>
          </div>
          {movementError && (
            <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm flex items-center gap-2 mb-4">
              <AlertCircle size={16} />
              {movementError}
            </div>
          )}
          <button 
            type="submit"
            disabled={isSubmitting}
            className={cn(
              "w-full text-white font-bold py-3 rounded-xl transition-all shadow-lg mt-4 disabled:opacity-50",
              movementType === 'entry' ? "bg-green-500 hover:bg-green-600 shadow-green-100" : "bg-red-500 hover:bg-red-600 shadow-red-100"
            )}
          >
            {isSubmitting ? 'Processando...' : `Confirmar ${movementType === 'entry' ? 'Entrada' : 'Saída'}`}
          </button>
        </form>
      </Modal>

      <Modal 
        isOpen={isDeleteModalOpen} 
        onClose={() => setIsDeleteModalOpen(false)} 
        title="Confirmar Exclusão"
      >
        <div className="space-y-6">
          <div className="bg-red-50 p-4 rounded-2xl">
            <p className="text-sm text-red-800">
              Tem certeza que deseja excluir a peça <span className="font-bold">{partToDelete?.name}</span>? 
              Esta ação não pode ser desfeita.
            </p>
          </div>
          <div className="flex gap-4">
            <button 
              onClick={() => setIsDeleteModalOpen(false)}
              className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-3 rounded-xl transition-all"
            >
              Cancelar
            </button>
            <button 
              onClick={() => partToDelete && handleDeletePart(partToDelete.id)}
              className="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-red-100"
            >
              Excluir
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
