/* Lily 口语陪练 Agent — 反馈面板渲染
 * 接收评估 JSON，渲染评分、维度详情、建议
 */

/**
 * 渲染评估反馈到右侧面板
 * @param {Object} evaluation - 评估 JSON
 */
function renderFeedback(evaluation) {
  const container = document.getElementById("feedback-content");
  if (!evaluation || !evaluation.dimensions) {
    container.innerHTML = '<div class="feedback-placeholder">评估数据异常</div>';
    return;
  }

  const dims = evaluation.dimensions;
  const overall = evaluation.oververall_score || evaluation.overall_score || 0;

  // 构建 HTML
  let html = `
    <div class="overall-score">
      <div class="score-label">总分</div>
      <div class="score-value ${getScoreClass(overall)}">${overall}</div>
    </div>
    <div class="dimensions">
  `;

  const dimNames = {
    grammar: "语法",
    vocabulary: "词汇",
    fluency: "流利度",
    appropriateness: "得体性",
  };

  for (const [key, name] of Object.entries(dimNames)) {
    const d = dims[key];
    if (!d) continue;
    html += `
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
        ` : ""}
        ${d.suggestions ? `<div class="dim-suggestions">💡 ${escapeHtml(d.suggestions)}</div>` : ""}
      </div>
    `;
  }

  html += `</div>`;

  // 修改后正确句子
  if (evaluation.corrected_sentence) {
    html += `
      <div class="corrected">
        <div class="corrected-label">✏️ 正确写法</div>
        <div class="corrected-text">${escapeHtml(evaluation.corrected_sentence)}</div>
      </div>
    `;
  }

  // 鼓励语
  if (evaluation.encouragement) {
    html += `<div class="encouragement">✨ ${escapeHtml(evaluation.encouragement)}</div>`;
  }

  container.innerHTML = html;
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
