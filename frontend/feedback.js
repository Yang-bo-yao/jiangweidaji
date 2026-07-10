/* Feedback panel rendering */

let radarChart = null;

function renderFeedback(evaluation) {
  const container = document.getElementById("feedback-content");
  if (!evaluation || !evaluation.dimensions) {
    container.innerHTML = '<div class="feedback-placeholder">Invalid review</div>';
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
        ${
          errors.length > 0
            ? `<div class="dim-errors">${errors.map((item) =>
                `<div class="error-item">${escapeHtml(item)}</div>`
              ).join("")}</div>`
            : '<div class="dim-ok">无明显错误</div>'
        }
        ${
          dim.suggestions
            ? `<div class="dim-suggestions">${escapeHtml(dim.suggestions)}</div>`
            : ""
        }
      </div>
    `;
  }).join("");

  container.innerHTML = `
    <div class="overall-score">
      <div class="score-label">总分</div>
      <div class="score-value ${getScoreClass(overall)}">${overall}</div>
    </div>
    <div class="radar-wrapper">
      <canvas id="radar-chart"></canvas>
    </div>
    <div class="dimensions">${dimCards}</div>
    ${
      evaluation.corrected_sentence
        ? `<div class="corrected">
            <div class="corrected-label">推荐表达</div>
            <div class="corrected-text">${escapeHtml(evaluation.corrected_sentence)}</div>
          </div>`
        : ""
    }
    ${
      evaluation.encouragement
        ? `<div class="encouragement">${escapeHtml(evaluation.encouragement)}</div>`
        : ""
    }
  `;

  renderRadarChart(dims);
}

function renderRadarChart(dims) {
  const ctx = document.getElementById("radar-chart");
  if (!ctx || !window.Chart) return;

  if (radarChart) {
    radarChart.destroy();
  }

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
        backgroundColor: "rgba(8, 123, 131, 0.16)",
        borderColor: "rgba(8, 123, 131, 0.9)",
        pointBackgroundColor: "#e55f4f",
        pointBorderColor: "#ffffff",
        pointHoverBackgroundColor: "#ffffff",
        pointHoverBorderColor: "#087b83",
        pointRadius: 4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 1.15,
      scales: {
        r: {
          beginAtZero: true,
          max: 100,
          ticks: {
            stepSize: 25,
            color: "#62717f",
            backdropColor: "transparent",
            font: { size: 9 },
          },
          pointLabels: {
            color: "#17212b",
            font: { size: 11, weight: "700" },
          },
          grid: { color: "rgba(23, 33, 43, 0.1)" },
          angleLines: { color: "rgba(23, 33, 43, 0.1)" },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => `${context.label}: ${context.raw} 分`,
          },
        },
      },
    },
  });
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
