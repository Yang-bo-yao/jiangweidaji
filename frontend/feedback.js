/* Lily 口语陪练 — 反馈面板渲染 (多邻国风格)
 * 雷达图 + 进度环 + 维度卡片
 */

let radarChart = null;

function renderFeedback(evaluation) {
  const container = document.getElementById("feedback-content");
  if (!evaluation || !evaluation.dimensions) {
    container.innerHTML = '<div class="feedback-placeholder">评估数据异常</div>';
    return;
  }

  const dims = evaluation.dimensions;
  const overall = Number(evaluation.overall_score || 0);
  const dimNames = {
    grammar: "语法",
    vocabulary: "词汇",
    fluency: "流利度",
    appropriateness: "得体性",
  };

  const dimCards = Object.entries(dimNames).map(([key, name]) => {
    const dim = dims[key];
    if (!dim) return "";
    const score = Number(dim.score || 0);
    const errors = Array.isArray(dim.errors) ? dim.errors : [];
    return `
      <div class="dim-card">
        <div class="dim-header">
          <span class="dim-name">${name}</span>
          <span class="dim-score ${getScoreClass(score)}">${score}</span>
        </div>
        <div class="dim-bar">
          <div class="dim-bar-fill ${getScoreClass(score)}" style="width: ${score}%"></div>
        </div>
        ${errors.length > 0
          ? `<div class="dim-errors">${errors.map(e => `<div class="error-item">⚠️ ${escapeHtml(e)}</div>`).join("")}</div>`
          : '<div class="dim-ok">✓ 无明显错误</div>'}
        ${dim.suggestions ? `<div class="dim-suggestions">💡 ${escapeHtml(dim.suggestions)}</div>` : ""}
      </div>`;
  }).join("");

  container.innerHTML = `
    <div class="overall-score">
      <div class="score-label">总分</div>
      <div class="score-value ${getScoreClass(overall)}">${overall}</div>
    </div>
    <div class="radar-wrapper"><canvas id="radar-chart"></canvas></div>
    <div class="dimensions">${dimCards}</div>
    ${evaluation.corrected_sentence ? `
      <div class="corrected">
        <div class="corrected-label">✏️ 推荐表达</div>
        <div class="corrected-text">${escapeHtml(evaluation.corrected_sentence)}</div>
      </div>` : ""}
    ${evaluation.encouragement ? `<div class="encouragement">✨ ${escapeHtml(evaluation.encouragement)}</div>` : ""}
  `;

  renderRadarChart(dims);
  updateRingProgress(overall);
}

function renderRadarChart(dims) {
  const ctx = document.getElementById("radar-chart");
  if (!ctx || !window.Chart) return;
  if (radarChart) radarChart.destroy();

  radarChart = new Chart(ctx, {
    type: "radar",
    data: {
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
        backgroundColor: "rgba(88, 204, 2, 0.15)",
        borderColor: "rgba(88, 204, 2, 0.8)",
        pointBackgroundColor: "#1cb0f6",
        pointBorderColor: "#fff",
        pointHoverBackgroundColor: "#fff",
        pointHoverBorderColor: "#58cc02",
        pointRadius: 4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 1.2,
      scales: {
        r: {
          beginAtZero: true,
          max: 100,
          ticks: { stepSize: 25, color: "#afafaf", backdropColor: "transparent", font: { size: 9 } },
          pointLabels: { color: "#3c3c3c", font: { size: 11, weight: "700" } },
          grid: { color: "rgba(0,0,0,0.06)" },
          angleLines: { color: "rgba(0,0,0,0.06)" },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => `${c.label}: ${c.raw} 分` } },
      },
    },
  });
}

function updateCoachSummary(evaluation) {
  const score = Number(evaluation.overall_score || 0);
  const scoreEl = document.getElementById("summary-score");
  const ringEl = document.getElementById("ring-fill");

  scoreEl.textContent = score;
  scoreEl.className = `summary-score ${getScoreClass(score)}`;

  // 进度环
  const circumference = 176;
  const offset = circumference - (score / 100) * circumference;
  ringEl.style.strokeDashoffset = offset;
  ringEl.className = `ring-fill ${getScoreClass(score)}`;

  const summaryText = document.querySelector(".summary-text");
  summaryText.innerHTML = `
    <strong>${escapeHtml(evaluation.encouragement || "Nice effort!")}</strong>
    <p>${escapeHtml(evaluation.corrected_sentence || "Keep practicing!")}</p>
  `;
}

function updateRingProgress(score) {
  const circumference = 176;
  const offset = circumference - (score / 100) * circumference;
  const ringEl = document.getElementById("ring-fill");
  if (ringEl) {
    ringEl.style.strokeDashoffset = offset;
    ringEl.className = `ring-fill ${getScoreClass(score)}`;
  }
}

function resetFeedbackPanel() {
  const ringEl = document.getElementById("ring-fill");
  if (ringEl) {
    ringEl.style.strokeDashoffset = 176;
    ringEl.className = "ring-fill";
  }
  const scoreEl = document.getElementById("summary-score");
  if (scoreEl) {
    scoreEl.textContent = "--";
    scoreEl.className = "summary-score";
  }
  document.querySelector(".summary-text").innerHTML = `
    <strong>No review yet</strong>
    <p>Your next evaluated turn will appear here.</p>
  `;
  document.getElementById("feedback-content").innerHTML = `
    <div class="feedback-placeholder">
      <div class="placeholder-icon">🎯</div>
      <p>完成一轮对话后<br>这里会显示评分和反馈</p>
    </div>
  `;
}

function getScoreClass(score) {
  if (score >= 85) return "score-high";
  if (score >= 70) return "score-mid";
  return "score-low";
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = String(text ?? "");
  return div.innerHTML;
}
