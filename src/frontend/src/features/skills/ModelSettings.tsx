import { useLocalState } from "./local-state";
import ModelFailover from "./ModelFailover";
import ModelLibrary from "./ModelLibrary";
import { useState } from "react";
import { Settings, ArrowLeft } from "lucide-react";
import { type SkillWorkflow, type Skill } from "./skill-state";
import "../../preview/model-settings.css";
export default function ModelSettings({
  back,
  changed,
}: {
  skills: Skill[];
  workflows: SkillWorkflow[];
  back: () => void;
  changed: () => void;
}) {
  const [tab, setTab] = useState("models");
  const [budget, setBudget] = useLocalState("budget", () => 200);
  const [budgetAlert, setBudgetAlert] = useLocalState(
    "budget-alert",
    () => true,
  );
  const update = changed;
  return (
    <main className="ms-page">
      <div className="ms-heading">
        <div>
          <h1>设置</h1>
          <p>管理你的模型与调用偏好</p>
        </div>
        <button className="sc-secondary" onClick={back}>
          <ArrowLeft size={15} />
          返回技能中心
        </button>
      </div>
      <div className="ms-layout">
        <nav className="ms-nav">
          <button className="active">
            <Settings size={16} />
            模型配置
          </button>
          <small>个人设置</small>
        </nav>
        <section className="ms-content">
          <h2>模型配置</h2>
          <div className="ms-tabs">
            {[
              ["models", "模型管理"],
              ["cost", "成本控制"],
              ["advanced", "高级配置"],
            ].map(([key, label]) => (
              <button
                key={key}
                className={tab === key ? "active" : ""}
                onClick={() => {
                  setTab(key);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === "models" && <ModelLibrary changed={update} />}
          {tab === "cost" && (
            <>
              <div className="ms-panel-intro">
                <p>设置预算提醒并了解各档位的本月用量</p>
                <small>示例数据</small>
              </div>
              <section className="mc-card">
                <div className="mc-grid">
                  <div>
                    <label className="sc-form">
                      月度预算
                      <div className="mc-budget">
                        <input
                          aria-label="月度预算"
                          type="number"
                          min="0"
                          value={budget}
                          onChange={(e) =>
                            setBudget(Math.max(0, Number(e.target.value) || 0))
                          }
                        />
                        <span>元</span>
                      </div>
                    </label>
                    <div className="mc-alert">
                      <div>
                        <strong>超额提醒</strong>
                        <small>接近或超过预算时提醒</small>
                      </div>
                      <button
                        role="switch"
                        aria-label="超额提醒"
                        aria-checked={budgetAlert}
                        className="mr-switch"
                        onClick={() => setBudgetAlert(!budgetAlert)}
                      >
                        <i />
                      </button>
                    </div>
                  </div>
                  <div>
                    <h4>本月用量</h4>
                    <div className="mc-bars">
                      {[
                        ["质量优先", 86],
                        ["均衡", 41],
                        ["速度优先", 9],
                      ].map(([label, value]) => (
                        <div className="mc-usage" key={label}>
                          <b>{label}</b>
                          <div className="mc-track">
                            <span
                              style={{
                                width: `${(Number(value) / 86) * 100}%`,
                              }}
                            />
                          </div>
                          <span>¥{value}</span>
                        </div>
                      ))}
                    </div>
                    <p>按技能 × 模型统计 · 本月合计 ¥136（示例）</p>
                    {budgetAlert && budget > 0 && 136 >= budget && (
                      <div className="sc-warning" role="status">
                        本月示例用量已达到月度预算。
                      </div>
                    )}
                  </div>
                </div>
              </section>
            </>
          )}
          {tab === "advanced" && (
            <>
              <div className="ms-panel-intro">
                <p>设置默认档位、主备模型顺序与故障转移策略</p>
              </div>
              <ModelFailover changed={update} />
            </>
          )}
          <p className="ms-demo-note">
            配置已保存在当前浏览器；连接测试与用量为模拟数据。
          </p>
        </section>
      </div>
    </main>
  );
}
