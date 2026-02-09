
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ethers, BrowserProvider, Contract, formatEther, isAddress } from 'ethers';
import { CONTRACT_ADDRESS, CONTRACT_ABI, BSC_RPC_URL } from './constants';
import { KingdomData, LogEntry } from './types';

declare global {
  interface Window {
    ethereum?: any;
  }
}

const BUILDING_TYPES = [
  { type: 1, name: "Sentry", cost: 10000, yield: 8, icon: "🏰" },
  { type: 2, name: "Outpost", cost: 28000, yield: 24, icon: "⚔️" },
  { type: 3, name: "Fort", cost: 54000, yield: 48, icon: "🛡️" },
  { type: 4, name: "Citadel", cost: 100000, yield: 96, icon: "🏛️" },
  { type: 5, name: "Stronghold", cost: 250000, yield: 248, icon: "🏯" },
  { type: 6, name: "Bastion", cost: 500000, yield: 520, icon: "⚒️" },
  { type: 7, name: "Capital", cost: 1000000, yield: 1100, icon: "👑" },
  { type: 8, name: "Core", cost: 2000000, yield: 2300, icon: "💎" },
];

const EXIT_HORIZON_HOURS = 30 * 24; // 720 hours until project "scams"

const StatusLog: React.FC<{ logs: LogEntry[] }> = ({ logs }) => {
  const logEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);
  return (
    <div className="apple-dark-card p-4 h-[100px] overflow-y-auto custom-scrollbar mt-4">
      <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-2 italic">Terminal_Output</h3>
      <div className="space-y-1">
        {logs.map((log) => (
          <div key={log.id} className="text-[11px] flex gap-3 border-b border-white/5 pb-1 items-center">
            <span className="text-zinc-600 font-mono w-14">{log.timestamp}</span>
            <span className={`${log.type === 'error' ? 'text-red-400' : log.type === 'success' ? 'text-emerald-400' : 'text-zinc-400'} truncate`}>
              {log.message}
            </span>
          </div>
        ))}
        <div ref={logEndRef} />
      </div>
    </div>
  );
};

export default function App() {
  const [account, setAccount] = useState<string | null>(null);
  const [viewAddress, setViewAddress] = useState<string>('');
  const [balance, setBalance] = useState<string>('0');
  const [contractBalance, setContractBalance] = useState<{bnb: string, usd: string, raw: number}>({bnb: '0', usd: '0', raw: 0});
  const [kingdom, setKingdom] = useState<KingdomData | null>(null);
  const [accumulated, setAccumulated] = useState({ gold: 0, gems: 0 });
  const [loading, setLoading] = useState<boolean>(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [winChance, setWinChance] = useState<string>('50');
  const [bnbPrice, setBnbPrice] = useState<number>(0);

  const addLog = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
    setLogs(prev => [...prev.slice(-10), { id: Math.random().toString(36).substr(2, 9), message, type, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) }]);
  };

  const fetchGlobalData = async () => {
    try {
      const provider = new ethers.JsonRpcProvider(BSC_RPC_URL);
      const cBal = await provider.getBalance(CONTRACT_ADDRESS);
      const bnbVal = formatEther(cBal);
      const priceRes = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BNBUSDT');
      const priceData = await priceRes.json();
      const price = parseFloat(priceData.price);
      setBnbPrice(price);
      setContractBalance({
        raw: Number(bnbVal),
        bnb: Number(bnbVal).toFixed(2),
        usd: (Number(bnbVal) * price).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
      });
    } catch (err) {
      console.error("Global sync failed", err);
    }
  };

  useEffect(() => {
    fetchGlobalData();
    const interval = setInterval(fetchGlobalData, 30000);
    return () => clearInterval(interval);
  }, []);

  const gemToUsd = (gems: number) => {
    return (gems * 0.0000004) * bnbPrice;
  };

  useEffect(() => {
    const timer = setInterval(() => {
      if (kingdom && kingdom.claimTime > 0) {
        const now = Math.floor(Date.now() / 1000);
        const lastHour = Math.floor(kingdom.claimTime / 3600);
        const currentHour = Math.floor(now / 3600);
        if (currentHour > lastHour) {
          const earned = (currentHour - lastHour) * kingdom.perHour;
          setAccumulated({ gold: earned, gems: earned });
        } else {
          setAccumulated({ gold: 0, gems: 0 });
        }
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [kingdom]);

  useEffect(() => {
    if (window.ethereum) {
      window.ethereum.request({ method: 'eth_accounts' }).then((accounts: string[]) => {
        if (accounts.length > 0) {
          setAccount(accounts[0]);
          setViewAddress(accounts[0]);
          refreshData(accounts[0]);
        }
      });
    }
  }, []);

  const connectWallet = async () => {
    if (!window.ethereum) return addLog('MetaMask не найден', 'error');
    try {
      setLoading(true);
      const provider = new BrowserProvider(window.ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);
      setAccount(accounts[0]);
      setViewAddress(accounts[0]);
      addLog(`Кошелек подключен`, 'success');
      await refreshData(accounts[0]);
    } catch (err: any) { addLog('Ошибка подключения', 'error'); } finally { setLoading(false); }
  };

  const refreshData = async (addr: string) => {
    if (!isAddress(addr)) return;
    try {
      const provider = new ethers.JsonRpcProvider(BSC_RPC_URL);
      const bal = await provider.getBalance(addr);
      setBalance(formatEther(bal));
      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
      const kd = await contract.getKingdom(addr);
      setKingdom({
        gold: Number(kd[0]),
        gems: Number(kd[1]),
        perHour: Number(kd[2]),
        alliesCount: Number(kd[3]),
        alliesEarned: Number(kd[4]),
        claimTime: Number(kd[5]),
        battleTime: Number(kd[6]),
        tiles: Array.from(kd[11]).map(t => Number(t))
      });
    } catch (err: any) { addLog('Sync...', 'info'); }
  };

  const executeTx = async (methodName: string, params: any[], value: bigint = 0n) => {
    if (!account) return addLog('Подключите кошелек', 'error');
    try {
      setLoading(true);
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = await contract[methodName](...params, { value });
      addLog(`TX Sent`, 'info');
      await tx.wait();
      addLog(`TX Confirmed`, 'success');
      await refreshData(viewAddress || account);
      fetchGlobalData();
    } catch (err: any) { addLog(`Error`, 'error'); } finally { setLoading(false); }
  };

  const build = (type: number, cost: number) => {
    const firstFree = kingdom?.tiles.indexOf(0);
    if (firstFree === -1 || firstFree === undefined) return addLog('Limit reached', 'error');
    if (totalGold < cost) return addLog('No gold', 'error');
    executeTx('placeBuildings', [[firstFree], type]);
  };

  const isOwnAccount = account?.toLowerCase() === viewAddress?.toLowerCase();
  const totalGold = (kingdom?.gold || 0) + accumulated.gold;
  const totalGems = (kingdom?.gems || 0) + accumulated.gems;

  const activeBuildings = kingdom?.tiles.map((raw, id) => {
    const baseType = raw % 10;
    const upgrades = Math.floor(raw / 10);
    const displayLevel = 1 + upgrades; 
    return { id, raw, baseType, upgrades, displayLevel };
  }).filter(b => b.raw > 0) || [];

  const dailyYield = (kingdom?.perHour || 0) * 24;
  const chanceNum = parseInt(winChance);
  const potentialReward = Math.floor(dailyYield * (chanceNum / 100) * 1.5);
  const potentialLoss = Math.floor(dailyYield * 0.5);

  // Strategic Battle recommendation: 60% yields the highest expected value mathematically
  const recommendedChance = 60;

  // Expected value per hour from battles (EV(p) = p * Reward - (1-p) * Loss)
  const battleExpectedGainPerHour = (potentialReward * (chanceNum / 100)) - (potentialLoss * (1 - (chanceNum / 100)));

  // PONZI STRATEGIC ADVISOR: Maximize net gem profit by day 30
  const bestAction = useMemo(() => {
    if (!kingdom) return null;
    
    const options: any[] = [];
    const slotsAvailable = kingdom.tiles.includes(0);
    const currentYield = kingdom.perHour + Math.max(0, battleExpectedGainPerHour);

    // 1. Buying new
    if (slotsAvailable) {
      BUILDING_TYPES.forEach(b => {
        const costToSave = Math.max(0, b.cost - totalGold);
        const hoursToSave = costToSave / currentYield;
        const productiveHours = EXIT_HORIZON_HOURS - hoursToSave;
        
        if (productiveHours > 0) {
          const netGemProfitByEnd = (b.yield * productiveHours) - b.cost;
          if (netGemProfitByEnd > 0) {
            options.push({
              type: 'BUY',
              name: b.name,
              cost: b.cost,
              yieldInc: b.yield,
              breakevenHours: b.cost / b.yield,
              totalProfitByEnd: netGemProfitByEnd,
              hoursToSave,
              icon: b.icon,
              payload: [b.type, b.cost]
            });
          }
        }
      });
    }

    // 2. Upgrading
    activeBuildings.forEach(b => {
      if (b.upgrades < 9) {
        const base = BUILDING_TYPES.find(t => t.type === b.baseType);
        if (base) {
          const upCost = base.cost / 4;
          const upYield = base.yield / 4;
          const costToSave = Math.max(0, upCost - totalGold);
          const hoursToSave = costToSave / currentYield;
          const productiveHours = EXIT_HORIZON_HOURS - hoursToSave;

          if (productiveHours > 0) {
            const netGemProfitByEnd = (upYield * productiveHours) - upCost;
            if (netGemProfitByEnd > 0) {
              options.push({
                type: 'UPGRADE',
                name: `${base.name} #${b.id}`,
                cost: upCost,
                yieldInc: upYield,
                breakevenHours: upCost / upYield,
                totalProfitByEnd: netGemProfitByEnd,
                hoursToSave,
                icon: base.icon,
                payload: [b.id]
              });
            }
          }
        }
      }
    });

    if (options.length === 0) return { type: 'STOP', name: 'Extraction Mode', totalProfitByEnd: 0, cost: 0 };

    return options.sort((a, b) => b.totalProfitByEnd - a.totalProfitByEnd)[0];
  }, [kingdom, activeBuildings, totalGold, battleExpectedGainPerHour]);

  const withdrawAll = () => {
    if (totalGems <= 0) return addLog('Empty storage', 'error');
    executeTx('sellGems', [totalGems]);
  };

  return (
    <div className="min-h-screen bg-black text-white px-4 py-2 md:px-8 lg:px-12 max-w-[1440px] mx-auto overflow-hidden flex flex-col">
      
      {/* HEADER */}
      <header className="flex flex-col lg:flex-row justify-between items-center mb-4 gap-4">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl flex items-center justify-center text-xl font-black shadow-lg shadow-blue-500/10">K</div>
          <div>
            <h1 className="text-xl font-black tracking-tight uppercase italic">Kingdom Commander</h1>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"></span>
              <span className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest">PONZI HORIZON: 30 DAYS REMAINING</span>
            </div>
          </div>
        </div>

        <div className="flex gap-3 items-center">
          <div className="apple-dark-card px-4 py-2 flex items-center gap-3 border-emerald-500/10 bg-emerald-500/5">
            <div className="text-right">
              <span className="block text-[8px] font-bold text-emerald-500 uppercase">Pool Liquidity</span>
              <span className="text-[14px] font-black tabular-nums text-emerald-400">{contractBalance.usd}</span>
            </div>
            <div className="h-6 w-[1px] bg-emerald-500/20"></div>
            <span className="text-[11px] font-bold text-zinc-500 tabular-nums">{contractBalance.bnb} BNB</span>
          </div>

          <div className="flex gap-3 items-center apple-dark-card p-1 pr-3 h-11">
            <input 
              type="text" placeholder="Address..." value={viewAddress}
              onChange={(e) => setViewAddress(e.target.value)}
              className="bg-zinc-800/40 border-none px-3 py-1.5 rounded-lg text-[12px] outline-none w-32 font-medium"
            />
            {account ? (
              <div className="flex items-center gap-2 pl-1 border-l border-white/5">
                 <span className="text-[11px] font-bold text-zinc-400">{account.slice(0, 4)}...{account.slice(-4)}</span>
              </div>
            ) : (
              <button onClick={connectWallet} className="bg-white text-black px-4 h-8 rounded-lg font-bold text-[11px]">Connect</button>
            )}
          </div>
        </div>
      </header>

      {/* STATS PANEL */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {[
          { label: 'Золото (Gold)', val: `${totalGold.toLocaleString()} G`, sub: `In-Game Reserve`, color: 'text-amber-400', icon: '🟡' },
          { label: 'Гемы (Gems)', val: `${totalGems.toLocaleString()} 💎`, sub: `~$${gemToUsd(totalGems).toFixed(2)}`, color: 'text-indigo-400', icon: '💎' },
          { label: 'Доход/час', val: `${(kingdom?.perHour ?? 0).toLocaleString()} G/h`, sub: `+$${gemToUsd(kingdom?.perHour || 0).toFixed(3)}/h`, color: 'text-emerald-400', icon: '📈' },
          { label: 'Баланс BNB', val: `${Number(balance).toFixed(4)} BNB`, sub: `$${(Number(balance) * bnbPrice).toFixed(2)}`, color: 'text-white', icon: '💳' }
        ].map((s, i) => (
          <div key={i} className="apple-dark-card p-4 flex justify-between items-center group">
            <div>
              <div className="text-[9px] font-bold text-zinc-600 uppercase mb-0.5">{s.label}</div>
              <div className={`text-lg font-black ${s.color} tabular-nums`}>{s.val}</div>
              <div className="text-[10px] text-zinc-500 font-bold tabular-nums">{s.sub}</div>
            </div>
            <span className="text-lg opacity-20">{s.icon}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1">
        
        {/* LEFT COLUMN: SHOP */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          <div className="apple-dark-card p-6 h-[460px] flex flex-col">
            <h2 className="text-[11px] font-bold mb-4 text-zinc-400 uppercase tracking-[0.2em] border-b border-white/5 pb-2">Unit_Store</h2>
            <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar space-y-2">
              {BUILDING_TYPES.map((b) => {
                const canAfford = totalGold >= b.cost;
                return (
                  <div key={b.type} className="p-3 rounded-xl bg-zinc-900/40 border border-white/5 flex items-center justify-between group">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{b.icon}</span>
                      <div>
                        <div className="text-white font-bold text-[13px]">{b.name}</div>
                        <div className="text-[10px] text-zinc-500 font-mono">
                          {b.cost.toLocaleString()} G
                        </div>
                        <div className="text-[9px] text-emerald-500 font-bold">+{b.yield} G/h <span className="text-zinc-500 font-normal opacity-50 ml-1">(~$${gemToUsd(b.yield).toFixed(3)})</span></div>
                      </div>
                    </div>
                    <button 
                      onClick={() => build(b.type, b.cost)}
                      disabled={!isOwnAccount || loading || !canAfford}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-bold ${canAfford ? 'bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-500/10' : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'}`}
                    >Buy</button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="apple-dark-card p-6 h-[260px] border-indigo-500/10 bg-indigo-500/5 flex flex-col justify-between">
            <h3 className="text-[11px] font-bold text-indigo-400 uppercase tracking-[0.2em] mb-2">Extraction_Center</h3>
            <div className="bg-black/40 p-5 rounded-xl text-center border border-white/5">
              <span className="text-3xl font-black text-white tabular-nums">{totalGems.toLocaleString()} 💎</span>
              <div className="mt-2 flex items-center justify-center gap-2">
                <span className="text-indigo-400 font-black text-lg tabular-nums">${gemToUsd(totalGems).toFixed(2)}</span>
                <span className="text-[9px] text-zinc-600 uppercase font-bold">Total Liquid</span>
              </div>
              {gemToUsd(totalGems) > (contractBalance.raw * bnbPrice) && (
                <div className="mt-2 text-[9px] text-red-500 font-black animate-pulse uppercase">Insufficient Contract Liquidity!</div>
              )}
            </div>
            <button 
              onClick={withdrawAll}
              disabled={loading || totalGems <= 0}
              className={`w-full py-4 rounded-xl font-bold text-[12px] transition-all ${totalGems > 0 ? 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-lg shadow-indigo-500/20' : 'bg-zinc-800 text-zinc-700 cursor-not-allowed'}`}
            >EXECUTE EXIT STRATEGY</button>
          </div>
        </div>

        {/* RIGHT COLUMN: INFRASTRUCTURE & ADVISOR */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          
          <div className="apple-dark-card p-6 h-[460px] flex flex-col">
            <div className="flex justify-between items-center mb-4 border-b border-white/5 pb-2">
              <h2 className="text-[11px] font-bold text-zinc-400 uppercase tracking-[0.2em]">Infrastructure</h2>
              <span className="text-[10px] text-zinc-600 font-mono italic">30D Extraction Optimization</span>
            </div>

            {/* STRATEGIC ADVISOR */}
            {bestAction && (
              <div className={`mb-4 p-4 rounded-2xl border relative overflow-hidden shadow-2xl transition-all duration-500 ${bestAction.type === 'STOP' ? 'bg-amber-500/10 border-amber-500/30' : 'bg-gradient-to-r from-zinc-900 to-black border-blue-500/30'}`}>
                {bestAction.type !== 'STOP' ? (
                  <>
                    <div className="absolute top-0 right-0 h-full w-48 bg-blue-500/5 blur-3xl"></div>
                    <div className="flex items-start justify-between relative z-10">
                      <div className="flex gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-blue-500/20 flex items-center justify-center border border-blue-500/40">
                          <span className="text-blue-400 animate-pulse text-2xl">💡</span>
                        </div>
                        <div className="flex-1">
                          <span className="text-[9px] font-black text-blue-500 uppercase tracking-widest">STRATEGIC PONZI ADVISOR</span>
                          <div className="text-white font-bold text-[15px] mt-0.5 leading-tight">
                            Recommended {bestAction.type === 'BUY' ? 'New Asset' : 'Optimization'}: <span className="text-blue-400">{bestAction.name}</span> {bestAction.icon}
                          </div>
                          <div className="text-[10px] mt-2 text-zinc-400 flex flex-wrap gap-x-6 gap-y-1">
                            <span>Projected Profit: <span className="text-emerald-400 font-black">+{bestAction.totalProfitByEnd.toLocaleString()} G (~$${gemToUsd(bestAction.totalProfitByEnd).toFixed(2)})</span></span>
                            <span>Breakeven: <span className="text-amber-500 font-bold">{Math.ceil(bestAction.breakevenHours)}h</span></span>
                            <span>Optimal Risk: <span className="text-white font-bold">{recommendedChance}% Battle Chance</span></span>
                          </div>
                        </div>
                      </div>
                      <button 
                        onClick={() => bestAction.type === 'BUY' ? build(bestAction.payload[0], bestAction.payload[1]) : executeTx('upgradeBuilding', [bestAction.payload[0]])}
                        disabled={totalGold < bestAction.cost || loading || !isOwnAccount}
                        className={`px-6 py-2 rounded-xl font-black text-[11px] uppercase transition-all shadow-lg ${totalGold >= bestAction.cost ? 'bg-white text-black hover:bg-zinc-200 shadow-blue-500/10' : 'bg-zinc-800 text-zinc-600 border border-white/5 cursor-not-allowed'}`}
                      >
                        {totalGold >= bestAction.cost ? 'Execute Strategy' : `Wait ${Math.ceil(bestAction.hoursToSave)}h`}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center gap-4 py-2 relative z-10">
                    <span className="text-3xl">🏦</span>
                    <div>
                      <div className="text-[10px] font-black text-amber-500 uppercase tracking-widest">STATIONARY PHASE REACHED</div>
                      <div className="text-white font-bold text-sm">No remaining investments yield profit within the 30-day window. Collect all resources.</div>
                      <div className="text-[10px] text-zinc-500 mt-1">Advisor Tip: Stick to <span className="text-white font-bold">{recommendedChance}% Chance</span> for maximal expected extraction.</div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {activeBuildings.map((b) => {
                  const baseStats = BUILDING_TYPES.find(t => t.type === b.baseType) || BUILDING_TYPES[0];
                  const upCost = baseStats.cost / 4;
                  const upYield = baseStats.yield / 4;
                  const curYield = baseStats.yield + (upYield * b.upgrades);
                  const nextYield = baseStats.yield + (upYield * (b.upgrades + 1));
                  const isMax = b.upgrades >= 9;
                  const canAfford = totalGold >= upCost;
                  const isRecommended = bestAction?.type === 'UPGRADE' && bestAction.payload[0] === b.id;
                  
                  return (
                    <div key={b.id} className={`p-4 rounded-xl bg-zinc-900/40 border flex items-center justify-between transition-all group ${isRecommended ? 'border-blue-500/40 bg-blue-500/10 shadow-lg shadow-blue-500/5' : 'border-white/5 hover:border-white/10'}`}>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-black flex items-center justify-center text-xl border border-white/5 shadow-lg group-hover:scale-110 transition-transform">{baseStats.icon}</div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-white font-bold text-[13px]">{baseStats.name}</span>
                            <span className="text-[9px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded font-black uppercase tracking-tighter">LVL {b.displayLevel}</span>
                          </div>
                          <div className="text-[10px] text-zinc-500 font-mono mt-1">
                            Current: <span className="text-emerald-500 font-bold">{curYield} G/h</span> <span className="text-zinc-600 opacity-60">(~$${gemToUsd(curYield).toFixed(3)})</span>
                            {!isMax && <div className="text-zinc-600">Upgrade: <span className="text-blue-400">+{upYield} G/h</span></div>}
                          </div>
                        </div>
                      </div>
                      {!isMax ? (
                        <button 
                          onClick={() => executeTx('upgradeBuilding', [b.id])}
                          disabled={!isOwnAccount || loading || !canAfford}
                          className={`px-3 py-1.5 rounded-lg text-[10px] font-bold shadow-sm transition-all ${canAfford ? 'bg-zinc-100 text-black hover:bg-white' : 'bg-zinc-800 text-zinc-600'}`}
                        >UP {upCost.toLocaleString()} G</button>
                      ) : (
                        <span className="text-[8px] text-zinc-600 font-bold uppercase tracking-widest opacity-40">MAX LVL</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* COMBAT */}
          <div className="apple-dark-card p-6 h-[260px] flex flex-col justify-between border-red-500/5 hover:border-red-500/20">
            <div className="flex justify-between items-center mb-2">
               <h2 className="text-[11px] font-bold text-zinc-400 uppercase tracking-[0.2em]">Tactical_Combat_Simulation</h2>
               <div className="flex gap-4">
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] text-emerald-500 font-bold uppercase tracking-wider">WIN +{potentialReward.toLocaleString()} G</span>
                    <span className="text-[8px] text-zinc-500 font-mono italic">Expected Reward</span>
                  </div>
                  <div className="flex flex-col items-end border-l border-white/5 pl-4">
                    <span className="text-[10px] text-red-500 font-bold uppercase tracking-wider">LOSS -{potentialLoss.toLocaleString()} G</span>
                    <span className="text-[8px] text-zinc-500 font-mono italic">Calculated Risk</span>
                  </div>
               </div>
            </div>

            <div className="flex items-center gap-6 bg-black/30 p-4 rounded-xl border border-white/5 shadow-inner">
              <div className="flex-1 flex flex-col gap-3">
                <div className="flex justify-between text-[8px] font-bold text-zinc-600 uppercase">
                  <span>Conservative</span>
                  <span className={`${parseInt(winChance) === recommendedChance ? 'text-blue-400 animate-pulse font-black' : ''}`}>Best Yield: {recommendedChance}%</span>
                  <span>Aggressive</span>
                </div>
                <input 
                  type="range" min="40" max="60" value={winChance} 
                  onChange={e => setWinChance(e.target.value)} 
                  className="w-full h-1.5 rounded-full appearance-none cursor-pointer" 
                />
              </div>
              <div className={`w-20 h-20 rounded-xl flex flex-col items-center justify-center shrink-0 shadow-2xl border transition-all ${parseInt(winChance) === recommendedChance ? 'bg-blue-600 text-white border-blue-400' : 'bg-white text-black border-white/20'}`}>
                <span className="text-[9px] font-bold uppercase opacity-60">Chance</span>
                <span className="text-2xl font-black">{winChance}%</span>
              </div>
            </div>

            <button 
              onClick={() => executeTx('battle', [parseInt(winChance)])}
              disabled={!isOwnAccount || loading || (kingdom?.perHour === 0)}
              className={`w-full py-4 rounded-xl font-black text-lg transition-all active:scale-[0.98] ${loading || (kingdom?.perHour === 0) ? 'bg-zinc-800 text-zinc-700' : 'bg-white text-black hover:bg-zinc-200 shadow-lg shadow-white/5'}`}
            >EXECUTE STRATEGIC STRIKE</button>
          </div>
        </div>
      </div>

      <StatusLog logs={logs} />
      
      <footer className="mt-2 text-center text-[10px] text-zinc-600 font-bold uppercase tracking-[0.3em] pb-2">
         System v6.3 // BSC Node: Grid Active // Exit Window: {EXIT_HORIZON_HOURS}h // Extraction Priority
      </footer>
    </div>
  );
}
