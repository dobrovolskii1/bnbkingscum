
import React, { useState, useEffect, useRef } from 'react';
import { ethers, BrowserProvider, Contract, formatEther, parseEther, isAddress } from 'ethers';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from './constants';
import { KingdomData, GlobalState, LogEntry } from './types';

declare global {
  interface Window {
    ethereum?: any;
  }
}

const StatusLog: React.FC<{ logs: LogEntry[] }> = ({ logs }) => {
  const logEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);
  return (
    <div className="mt-8 bg-black border border-green-900 rounded-lg p-4 h-48 overflow-y-auto font-mono text-sm">
      <div className="text-green-800 mb-2 uppercase tracking-widest text-xs border-b border-green-900 pb-1 flex justify-between">
        <span>System Logs</span>
        <span className="animate-pulse">_ONLINE</span>
      </div>
      {logs.length === 0 && <div className="text-green-900 italic">No activity detected on sub-channels...</div>}
      {logs.map((log) => (
        <div key={log.id} className="mb-1 flex">
          <span className="text-green-900 mr-2">[{log.timestamp}]</span>
          <span className={log.type === 'error' ? 'text-red-500 font-bold' : log.type === 'success' ? 'text-green-400 font-bold' : 'text-green-600'}>
            {log.message}
          </span>
        </div>
      ))}
      <div ref={logEndRef} />
    </div>
  );
};

export default function App() {
  const [account, setAccount] = useState<string | null>(null);
  const [viewAddress, setViewAddress] = useState<string>('');
  const [balance, setBalance] = useState<string>('0');
  const [kingdom, setKingdom] = useState<KingdomData | null>(null);
  const [globalState, setGlobalState] = useState<GlobalState | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [hasProvider, setHasProvider] = useState<boolean>(true);
  
  // States for simplified interactions
  const [buyAmount, setBuyAmount] = useState<string>('0.01');
  const [winChance, setWinChance] = useState<string>('50');
  const [gemsToSell, setGemsToSell] = useState<string>('100');

  const addLog = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
    setLogs(prev => [...prev, { id: Math.random().toString(36).substr(2, 9), message, type, timestamp: new Date().toLocaleTimeString() }]);
  };

  useEffect(() => {
    if (!window.ethereum) {
      setHasProvider(false);
      addLog('WARNING: Web3 Provider missing. Site restricted to VIEW_ONLY.', 'error');
    } else {
      window.ethereum.request({ method: 'eth_accounts' }).then((accounts: string[]) => {
        if (accounts.length > 0) {
          setAccount(accounts[0]);
          setViewAddress(accounts[0]);
          refreshData(accounts[0]);
        }
      });
    }
    fetchGlobal();
  }, []);

  const fetchGlobal = async () => {
    try {
      const provider = new ethers.JsonRpcProvider('https://bsc-dataseed.binance.org/');
      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
      const gs = await contract.getGlobalState();
      setGlobalState({ 
        totalDeposited: gs.totalDeposited, 
        totalKings: Number(gs.totalKings), 
        deploymentTime: gs.deploymentTime, 
        totalDeposits: Number(gs.totalDeposits) 
      });
    } catch (e) { console.error(e); }
  };

  const connectWallet = async () => {
    if (!window.ethereum) {
      setHasProvider(false);
      return addLog('CRITICAL: Provider blocked. Please open in a new tab.', 'error');
    }
    try {
      setLoading(true);
      const provider = new BrowserProvider(window.ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);
      setAccount(accounts[0]);
      setViewAddress(accounts[0]);
      addLog(`ACCESS_GRANTED: Welcome, Commander.`, 'success');
      await refreshData(accounts[0]);
    } catch (err: any) { 
      addLog(`AUTH_REJECTED: ${err.message}`, 'error'); 
    } finally { 
      setLoading(false); 
    }
  };

  const refreshData = async (addr: string) => {
    if (!isAddress(addr)) return;
    try {
      const provider = new ethers.JsonRpcProvider('https://bsc-dataseed.binance.org/');
      const bal = await provider.getBalance(addr);
      setBalance(formatEther(bal));
      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
      const kd = await contract.getKingdom(addr);
      
      const tilesArray = Array.from(kd.tiles).map(t => Number(t));

      setKingdom({
        gold: Number(kd.gold), gems: Number(kd.gems), perHour: Number(kd.perHour),
        alliesCount: Number(kd.alliesCount), alliesEarned: Number(kd.alliesEarned),
        claimTime: Number(kd.claimTime), battleTime: Number(kd.battleTime),
        tiles: tilesArray
      });
      addLog(`SYNC_COMPLETE: Kingdom metadata updated.`, 'info');
    } catch (err: any) { addLog(`SYNC_ERROR: ${err.message}`, 'error'); }
  };

  const executeTx = async (methodName: string, params: any[], value: bigint = 0n) => {
    if (!account) return addLog('AUTH_REQUIRED: Connect wallet.', 'error');
    try {
      setLoading(true);
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = await contract[methodName](...params, { value });
      addLog(`TX_PENDING: ${tx.hash.substring(0, 14)}...`, 'info');
      await tx.wait();
      addLog(`SUCCESS: ${methodName} confirmed on-chain.`, 'success');
      await refreshData(viewAddress || account);
    } catch (err: any) { 
      addLog(`FAILED: ${err.message}`, 'error'); 
    } finally { 
      setLoading(false); 
    }
  };

  const buildNew = () => {
    if (!kingdom) return;
    const firstFree = kingdom.tiles.indexOf(0);
    if (firstFree === -1) return addLog('ERROR: Kingdom is full!', 'error');
    executeTx('placeBuildings', [[firstFree], 1]);
  };

  const isOwnAccount = account?.toLowerCase() === viewAddress?.toLowerCase();
  const activeBuildings = kingdom?.tiles.map((lvl, id) => ({ id, lvl })).filter(b => b.lvl > 0) || [];

  return (
    <div className="min-h-screen matrix-bg p-4 md:p-8 flex flex-col items-center">
      <div className="max-w-6xl w-full">
        
        {/* Connection Notice */}
        {!hasProvider && (
          <div className="mb-6 p-4 border border-red-500 bg-red-950/20 text-red-500 text-xs font-mono rounded">
            🛑 <span className="font-bold">SANDBOX ERROR:</span> MetaMask blocked. Click the <span className="bg-red-500 text-black px-1 mx-1 font-bold">↗</span> icon in the top right to open in a new tab.
          </div>
        )}

        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-end mb-10 gap-6 border-b border-green-500/20 pb-8">
          <div>
            <h1 className="text-5xl font-black text-green-500 tracking-tighter drop-shadow-[0_0_10px_rgba(0,255,0,0.5)]">
              KINGDOM_v3
            </h1>
            <div className="flex items-center gap-2 mt-2 text-green-800 text-[10px] font-bold uppercase tracking-widest">
              <span className={`w-2 h-2 rounded-full ${account ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
              {account ? `Commander: ${account.substring(0, 14)}...` : 'Status: Offline'}
            </div>
          </div>
          
          <div className="flex gap-4 w-full md:w-auto">
            <input 
              type="text" 
              placeholder="SCAN_ADDRESS..."
              value={viewAddress}
              onChange={(e) => setViewAddress(e.target.value)}
              className="flex-1 md:w-64 bg-black border border-green-900 p-3 text-green-400 font-mono text-sm focus:border-green-500 outline-none"
            />
            <button 
              onClick={() => refreshData(viewAddress)} 
              className="px-6 py-3 bg-green-900/20 text-green-500 border border-green-500 hover:bg-green-500 hover:text-black font-black uppercase transition-all text-sm"
            >
              SCAN
            </button>
            <button 
              onClick={connectWallet}
              className={`px-6 py-3 border-2 rounded font-black uppercase text-sm transition-all ${account ? 'border-green-500 text-green-500' : 'bg-green-500 text-black border-green-500'}`}
            >
              {account ? 'Connected' : 'Login'}
            </button>
          </div>
        </header>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
          {[
            { label: 'Gold', val: kingdom?.gold || 0, unit: 'AU' },
            { label: 'Gems', val: kingdom?.gems || 0, unit: 'DMND' },
            { label: 'Hourly Yield', val: `+${kingdom?.perHour || 0}`, unit: '/HR' },
            { label: 'Wallet Balance', val: Number(balance).toFixed(4), unit: 'BNB' }
          ].map((s, i) => (
            <div key={i} className="hacker-border p-5 bg-green-500/5 group hover:bg-green-500/10 transition-all">
              <div className="text-[9px] text-green-800 font-black mb-1 uppercase tracking-widest">{s.label}</div>
              <div className="text-3xl font-black text-green-400">{s.val} <span className="text-xs text-green-900">{s.unit}</span></div>
            </div>
          ))}
        </div>

        {/* MAIN COMMAND CENTER */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-10">
          
          {/* Construction Shop & Tools */}
          <div className="lg:col-span-4 space-y-6">
            <section className="hacker-border p-6 bg-black/60 relative overflow-hidden group">
              <div className="absolute top-0 right-0 bg-green-500 text-black text-[9px] px-2 font-black">CONSTRUCTION_SHOP</div>
              <h3 className="text-green-500 font-black mb-4 uppercase text-lg">Deploy New Mine</h3>
              <p className="text-[10px] text-green-900 mb-6 uppercase leading-tight font-bold">
                Deploy a standard production unit to the next available sector. 
                <br /><br />
                <span className="text-green-700">Cost: 10 Gold (Min)</span><br />
                <span className="text-green-700">Yield: +1 Gold/Hour per Level</span>
              </p>
              <button 
                onClick={buildNew}
                disabled={!isOwnAccount || loading}
                className="w-full py-5 bg-green-500 text-black font-black uppercase text-sm hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-30 shadow-[0_0_20px_rgba(0,255,0,0.2)]"
              >
                Build New Unit
              </button>
            </section>

            <section className="hacker-border p-6 bg-black/60">
              <h3 className="text-green-500 font-black mb-4 uppercase text-sm tracking-widest">Finance Operations</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-[9px] text-green-800 font-black block mb-1 uppercase">Purchase Gold (BNB)</label>
                  <div className="flex gap-1">
                    <input type="text" value={buyAmount} onChange={e => setBuyAmount(e.target.value)} className="flex-1 bg-black border border-green-900 p-2 text-green-400 text-xs" />
                    <button onClick={() => executeTx('buyGold', [ethers.ZeroAddress], parseEther(buyAmount))} className="bg-green-900 text-green-400 px-4 text-[10px] font-black hover:bg-green-500 hover:text-black">BUY</button>
                  </div>
                </div>
                <div className="pt-4 border-t border-green-900/30">
                  <label className="text-[9px] text-red-900 font-black block mb-1 uppercase">Liquidate Gems</label>
                  <div className="flex gap-1">
                    <input type="number" value={gemsToSell} onChange={e => setGemsToSell(e.target.value)} className="flex-1 bg-black border border-red-900 p-2 text-red-400 text-xs" />
                    <button onClick={() => executeTx('sellGems', [parseInt(gemsToSell)])} className="bg-red-900/20 text-red-500 px-4 text-[10px] font-black border border-red-500/50 hover:bg-red-500 hover:text-black">SELL</button>
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* Active Assets List */}
          <div className="lg:col-span-8">
            <section className="hacker-border p-6 bg-black/80 h-full relative">
              <div className="absolute top-0 right-0 bg-green-500 text-black text-[9px] px-2 font-black uppercase tracking-widest">Active_Infrastructure</div>
              <h3 className="text-green-500 font-black mb-6 uppercase text-lg border-b border-green-900 pb-2">Your Kingdom Assets</h3>
              
              <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                {activeBuildings.length > 0 ? activeBuildings.map((b) => (
                  <div key={b.id} className="flex items-center justify-between p-4 bg-green-900/5 border border-green-900 hover:border-green-500 transition-colors group">
                    <div className="flex items-center gap-6">
                      <div className="w-12 h-12 flex items-center justify-center bg-green-900/20 border border-green-500/30 text-green-500 font-black">
                        #{b.id}
                      </div>
                      <div>
                        <div className="text-[10px] text-green-900 uppercase font-black">Mine_Level</div>
                        <div className="text-xl font-black text-green-400">LVL_{b.lvl}</div>
                        <div className="w-32 h-1 bg-green-900 mt-1">
                           <div className="bg-green-500 h-full shadow-[0_0_5px_#0f0]" style={{ width: `${Math.min(b.lvl, 100)}%` }}></div>
                        </div>
                      </div>
                      <div className="hidden sm:block">
                        <div className="text-[10px] text-green-900 uppercase font-black">Est_Output</div>
                        <div className="text-sm font-bold text-green-700">+{b.lvl} Gold/Hr</div>
                      </div>
                    </div>
                    
                    <button 
                      onClick={() => executeTx('upgradeBuilding', [b.id])}
                      disabled={!isOwnAccount || loading}
                      className="px-6 py-2 border border-green-500 text-green-500 text-[10px] font-black uppercase hover:bg-green-500 hover:text-black transition-all disabled:opacity-20"
                    >
                      Upgrade
                    </button>
                  </div>
                )) : (
                  <div className="text-center py-20 border-2 border-dashed border-green-900/30">
                    <p className="text-green-900 uppercase font-black text-sm mb-4">No active assets detected in this region.</p>
                    <button onClick={buildNew} className="text-green-500 border border-green-500 px-4 py-2 text-xs font-black uppercase hover:bg-green-500 hover:text-black transition-all">Start Construction</button>
                  </div>
                )}
              </div>
            </section>
          </div>

        </div>

        {/* BATTLE THEATER */}
        <section className="mb-10 hacker-border p-8 bg-red-950/5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 bg-red-600 text-black text-[9px] px-3 py-1 font-black">BATTLE_THEATER</div>
          <div className="flex flex-col md:flex-row items-center gap-10">
            <div className="flex-1 space-y-4">
              <h3 className="text-red-500 font-black text-2xl uppercase tracking-tighter">Offensive Operations</h3>
              <p className="text-[10px] text-red-900 uppercase font-bold max-w-md">
                Risk assets to seize enemy gold. Success probability is adjustable. Higher risk = Exponential Rewards based on production capacity.
              </p>
              <div className="space-y-2">
                <div className="flex justify-between text-[10px] font-black text-red-900 uppercase">
                  <span>Safe</span>
                  <span>Probability: {winChance}%</span>
                  <span>Extreme</span>
                </div>
                <input type="range" min="1" max="100" value={winChance} onChange={e => setWinChance(e.target.value)} className="w-full accent-red-600 h-1" />
              </div>
            </div>
            <button 
              onClick={() => executeTx('battle', [parseInt(winChance)])}
              disabled={!isOwnAccount || loading}
              className="w-full md:w-64 py-8 bg-red-600 text-black font-black text-xl uppercase hover:bg-white transition-all shadow-[0_0_30px_rgba(255,0,0,0.3)] disabled:opacity-20"
            >
              Launch Strike
            </button>
          </div>
        </section>

        <StatusLog logs={logs} />
        
        <footer className="mt-16 text-center text-green-900 font-mono text-[9px] tracking-[0.4em] uppercase py-12 opacity-30 border-t border-green-900/20">
           [TERMINAL_READY] // {new Date().toLocaleTimeString()} // v3.8.0-PRO
        </footer>

      </div>
    </div>
  );
}
