import { useState } from "react";
import { apiConfig } from "../mock/api";

/**
 * 控制面板: 调节 Mock API 的延迟和失败率
 * 方便在 demo 中实时观察不同条件下的行为
 */
export function ApiControls() {
  // 用 local state 驱动 UI, 直接修改 apiConfig (它是 mutable 的)
  const [delay, setDelay] = useState(apiConfig.baseDelay);
  const [failRate, setFailRate] = useState(apiConfig.failureRate);

  const handleDelayChange = (v: number) => {
    setDelay(v);
    apiConfig.baseDelay = v;
  };

  const handleFailRateChange = (v: number) => {
    setFailRate(v);
    apiConfig.failureRate = v;
  };

  return (
    <div className="rounded-xl border-2 border-gray-200 bg-white">
      <div className="border-b border-gray-100 px-4 py-3">
        <h2 className="text-sm font-bold text-gray-700">⚙️ API 模拟控制</h2>
        <p className="mt-0.5 text-[11px] text-gray-400">
          调节延迟和失败率, 观察乐观更新行为
        </p>
      </div>

      <div className="space-y-4 px-4 py-3">
        {/* Delay */}
        <div>
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-gray-600">
              ⏱ 延迟
            </label>
            <span className="text-xs font-mono text-gray-500">
              {delay}ms
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={5000}
            step={100}
            value={delay}
            onChange={(e) => handleDelayChange(Number(e.target.value))}
            className="mt-1 w-full accent-blue-500"
          />
          <div className="flex justify-between text-[10px] text-gray-300">
            <span>0ms (instant)</span>
            <span>5000ms</span>
          </div>
        </div>

        {/* Failure Rate */}
        <div>
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-gray-600">
              💥 失败率
            </label>
            <span className="text-xs font-mono text-gray-500">
              {Math.round(failRate * 100)}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={failRate}
            onChange={(e) => handleFailRateChange(Number(e.target.value))}
            className="mt-1 w-full accent-red-500"
          />
          <div className="flex justify-between text-[10px] text-gray-300">
            <span>0% (always success)</span>
            <span>100% (always fail)</span>
          </div>
        </div>

        {/* Presets */}
        <div className="flex gap-2">
          <button
            onClick={() => {
              handleDelayChange(200);
              handleFailRateChange(0);
            }}
            className="rounded-md border border-green-200 bg-green-50 px-2.5 py-1 text-[11px] font-medium text-green-600 transition-colors hover:bg-green-100"
          >
            🟢 理想网络
          </button>
          <button
            onClick={() => {
              handleDelayChange(1500);
              handleFailRateChange(0.3);
            }}
            className="rounded-md border border-yellow-200 bg-yellow-50 px-2.5 py-1 text-[11px] font-medium text-yellow-600 transition-colors hover:bg-yellow-100"
          >
            🟡 一般网络
          </button>
          <button
            onClick={() => {
              handleDelayChange(3000);
              handleFailRateChange(0.7);
            }}
            className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-medium text-red-600 transition-colors hover:bg-red-100"
          >
            🔴 糟糕网络
          </button>
        </div>
      </div>
    </div>
  );
}
