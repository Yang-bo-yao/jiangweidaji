/* Lily 口语陪练 Agent — 反馈面板渲染 (Phase 5: 雷达图 + 完整反馈)
 * 接收评估 JSON，渲染：
 *   1. 总分大数字
 *   2. 四维雷达图 (Chart.js)
 *   3. 各维度详细卡片 (评分条 + 错误 + 建议)
 *   4. 正确写法
 *   5. 鼓励语
 */

let radarChart = null;

/**
 * 渲染评估反馈到右侧面板
 */
function renderFeedback(evaluation) {
  const container = document.getElementById("feedback-content");
  if (!evaluation || !evaluation.dimensions) {
    container.innerHTML = '<div class="feedback-placeholder">评估数据异常</div>';
    return;
  }

  const dims = evaluation.dimensions;
  const overall = evaluation.overall_score || 0;

  // 构建 HTML
  container.innerHTML = `
    <div class="overall-score">
      <div class="score-label">总分</div>
      <div class="score-value ${getScoreClass(overall)}">${overall}</div>
    </div>
    <div class="radar-wrapper">
      <canvas id="radar-chart"></canvas>
    </div>
    <div class="dimensions"></div>
  `;

  // 渲染雷达图
  renderRadarChart(dims);

  // 渲染维度卡片
  const dimsContainer = container.querySelector(".dimensions");
  const dimNames = {
    grammar: "语法",
    vocabulary: "词汇",
    fluency: "流利度",
    appropriateness: "得体性",
  };

  for (const [key, name] of Object.entries(dimNames)) {
    const d = dims[key];
    if (!d) continue;
    dimsContainer.innerHTML += `
      <div class="dim-card">
        <div class="dim-header">
          <span class="dim-name">${name}</span>
          <span class="dim-score ${getScoreClass(d.score)}">${d.score}</span>
        </div>
        <div class="dim-bar">
          <div class="dim-bar-fill ${getScoreClass(d.score)}" style="width: ${d.score}%"></div>
        </div>
        ${d.errors && d.errors.length > 0 ? `
          <div class="dim-errors">
            ${d.errors.map(e => `<div class="error-item">⚠️ ${escapeHtml(e)}</div>`).join("")}
          </div>
        ` : '<div class="dim-ok">✓ 无明显错误</div>'}
        ${d.suggestions ? `<div class="dim-suggestions">💡 ${escapeHtml(d.suggestions)}</div>` : ""}
      </div>
    `;
  }

  // 正确写法
  if (evaluation.corrected_sentence) {
    container.innerHTML += `
      <div class="corrected">
        <div class="corrected-label">✏️ 正确写法</div>
        <div class="corrected-text">${escapeHtml(evaluation.corrected_sentence)}</div>
      </div>
    `;
  }

  // 鼓励语
  if (evaluation.encouragement) {
    container.innerHTML += `<div class="encouragement">✨ ${escapeHtml(evaluation.encouragement)}</div>`;
  }
}

/**
 * 用 Chart.js 渲染四维雷达图
 */
function renderRadarChart(dims) {
  const ctx = document.getElementById("radar-chart");
  if (!ctx) return;

  // 销毁旧图表
  if (radarChart) {
    radarChart.destroy();
  }

  const data = {
    labels: ["语法", "词汇", "流利度", "得体性"],
    datasets: [{
      label: "评分",
      data: [
        dims.grammar?.score || 0,
        dims.vocabulary?.score || 0,
        dims.fluency?.score || 0,
        dims.appropriateness?.score || 0,
      ],
      fill: true,
      backgroundColor: "rgba(102, 126, 234, 0.15)",
      borderColor: "rgba(102, 126, 234, 0.8)",
      pointBackgroundColor: "rgba(102, 126, 234, 1)",
      pointBorderColor: "#fff",
      pointHoverBackgroundColor: "#fff",
      pointHoverBorderColor: "rgba(102, 126, 234, 1)",
      pointRadius: 4,
    }],
  };

  radarChart = new Chart(ctx, {
    type: "radar",
    data: data,
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 1.2,
      scales: {
        r: {
          beginAtZero: true,
          max: 100,
          ticks: { stepSize: 25, font: { size: 9 }, backdropColor: "transparent" },
          pointLabels: { font: { size: 11, weight: "600" }, color: "#333" },
          grid: { color: "rgba(0,0,0,0.08)" },
          angleLines: { color: "rgba(0,0,0,0.08)" },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.label}: ${ctx.raw} 分`,
          },
        },
      },
    },
  });
}

/**
 * 根据分数返回样式类名
 */
function getScoreClass(score) {
  if (score >= 85) return "score-high";
  if (score >= 70) return "score-mid";
  return "score-low";
}

/**
 * HTML 转义防注入
 */
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
