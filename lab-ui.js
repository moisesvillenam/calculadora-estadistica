(function () {
  'use strict';
  const get = id => document.getElementById(id);
  const decimal = new Intl.NumberFormat('es', { maximumFractionDigits: 4 });
  const scientific = new Intl.NumberFormat('es', { maximumFractionDigits: 4, notation: 'scientific' });
  const fmt = value => {
    const magnitude = Math.abs(value);
    return (magnitude !== 0 && (magnitude < 0.0001 || magnitude >= 1e9) ? scientific : decimal).format(value);
  };
  let data = [], result = null, view = 'histogram', selected = null;
  let means = [], timer = null, random = Laboratory.seededRandom();
  const limit = 500;
  const samplingDescriptions = {
    replacement: 'Cada sorteo es independiente: una observación puede repetirse. Se permite n mayor que N.',
    simple: 'Selecciona posiciones al azar sin repetirlas. Todas las combinaciones tienen la misma probabilidad; n ≤ N.',
    systematic: 'Inicio aleatorio e intervalo N / n sobre el orden de entrada, sin repetir posiciones. La dispersión depende de ese orden; n ≤ N.'
  };
  const method = () => get('sampling-method').value;
  const svgNS = 'http://www.w3.org/2000/svg';
  const node = (tag, text, className) => {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
  };
  function emptyChart(id, message) {
    get(id).replaceChildren(node('p', message, 'empty-chart'));
  }
  function interval(bin, index, bins) {
    return `[${fmt(bin.from)}; ${fmt(bin.to)}${index === bins.length - 1 ? ']' : ')'}`;
  }
  function drawHistogram(id, bins, total, detailId) {
    const plot = node('div', undefined, 'histogram');
    plot.setAttribute('role', 'group');
    plot.setAttribute('aria-label', 'Frecuencias por intervalo. Usa Tab para explorar las barras.');
    const peak = Math.max(...bins.map(bin => bin.count), 1);
    bins.forEach((bin, i) => {
      const label = `${interval(bin, i, bins)}: ${bin.count} de ${total} (${fmt(bin.count / total * 100)} %)`;
      const button = node('button', undefined, 'histogram-bar');
      button.type = 'button';
      button.style.setProperty('--bar-height', `${bin.count / peak * 100}%`);
      button.setAttribute('aria-label', label);
      button.append(node('span', String(bin.count), 'bar-count'), node('span', undefined, 'bar-fill'));
      const describe = () => { get(detailId).textContent = label; };
      button.addEventListener('pointerenter', describe);
      button.addEventListener('focus', describe);
      button.addEventListener('click', describe);
      plot.append(button);
    });
    const axis = node('div', undefined, 'chart-axis');
    axis.append(node('span', fmt(bins[0].from)), node('span', 'Valor →'), node('span', fmt(bins[bins.length - 1].to)));
    get(id).replaceChildren(plot, axis);
  }
  function drawPoints() {
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 640 180');
    svg.setAttribute('role', 'group');
    svg.setAttribute('aria-label', 'Datos individuales en orden de entrada. Selecciona un punto para editarlo.');
    const position = value => result.max === result.min ? 320 : 24 + (value - result.min) / (result.max - result.min) * 592;
    // Points share a value axis. Rows only separate overlapping observations.
    data.slice(0, 80).forEach((value, i) => {
      const circle = document.createElementNS(svgNS, 'circle');
      circle.setAttribute('cx', position(value));
      circle.setAttribute('cy', 22 + (i % 7) * 22);
      circle.setAttribute('r', '7');
      circle.setAttribute('tabindex', '0');
      circle.setAttribute('role', 'button');
      circle.setAttribute('aria-label', `Dato ${i + 1}: ${fmt(value)}. Editar.`);
      circle.setAttribute('aria-pressed', String(selected === i));
      const select = () => {
        selected = i;
        svg.querySelectorAll('circle').forEach(c => c.setAttribute('aria-pressed', String(c === circle)));
        get('point-index').textContent = String(i + 1);
        get('point-value').value = String(data[i]);
        get('point-value').removeAttribute('aria-invalid');
        get('point-help').textContent = 'Edita este valor para ver su efecto.';
        get('point-editor').hidden = false;
        get('chart-detail').textContent = `Dato ${i + 1}: ${fmt(data[i])}. Modifica su valor debajo del gráfico.`;
      };
      circle.addEventListener('click', () => { select(); get('point-value').focus(); });
      circle.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(); get('point-value').focus(); }
      });
      svg.append(circle);
    });
    const axis = node('div', undefined, 'chart-axis');
    axis.append(node('span', fmt(result.min)), node('span', 'Valor →'), node('span', fmt(result.max)));
    get('data-chart').replaceChildren(svg, axis);
  }
  function renderData() {
    get('view-histogram').setAttribute('aria-pressed', String(view === 'histogram'));
    get('view-points').setAttribute('aria-pressed', String(view === 'points'));
    get('bins-control').hidden = view !== 'histogram';
    get('point-editor').hidden = view !== 'points' || selected === null || !data.length;
    if (!data.length) {
      emptyChart('data-chart', 'Tus datos, una nueva perspectiva.');
      get('frequency-table').replaceChildren();
      get('chart-caption').textContent = 'Carga un ejemplo o introduce tus datos.';
      get('chart-detail').textContent = 'Selecciona una barra o un punto para explorar.';
      return;
    }
    const bins = Laboratory.histogram(data, Number(get('bins').value));
    get('chart-caption').textContent = view === 'points'
      ? `${Math.min(data.length, 80)} de ${data.length} puntos · filas sin significado estadístico`
      : `${data.length} observaciones · altura = frecuencia`;
    get('chart-detail').textContent = view === 'points' ? 'Selecciona un punto para editar su valor.' : 'Explora las barras con el ratón, el tacto o Tab.';
    if (view === 'histogram') drawHistogram('data-chart', bins, data.length, 'chart-detail');
    else drawPoints();
    get('frequency-table').replaceChildren(...bins.map((bin, i) => {
      const row = node('tr');
      row.append(node('td', interval(bin, i, bins)), node('td', String(bin.count)), node('td', `${fmt(bin.count / data.length * 100)} %`));
      return row;
    }));
  }
  function pause() {
    clearTimeout(timer);
    timer = null;
  }
  function resetSimulation() {
    pause(); means = []; random = Laboratory.seededRandom();
    const sizeControl = get('sample-size');
    sizeControl.max = String(method() === 'replacement' ? 50 : Math.max(1, Math.min(50, data.length)));
    sizeControl.value = String(Math.min(Number(sizeControl.value), Number(sizeControl.max)));
    get('sample-size-value').textContent = sizeControl.value;
    get('sampling-help').textContent = samplingDescriptions[method()];
    get('draw-sample').disabled = !data.length;
    get('sample-values').value = '';
    get('sample-summary').textContent = '';
    get('simulate').disabled = !data.length;
    get('simulate').textContent = 'Iniciar simulación ▶';
    get('reset-simulation').disabled = !data.length;
    get('simulation-count').textContent = '0 / 500';
    get('simulation-progress').value = 0;
    get('simulation-mean').textContent = '—';
    get('simulation-spread').textContent = '—';
    let theory = '—';
    if (result) {
      const size = Number(sizeControl.value);
      const standardError = Statistics.calculateStatistics(data).standardDeviation / Math.sqrt(size);
      theory = method() === 'systematic' ? 'Depende del orden' : fmt(method() === 'simple'
        ? standardError * (data.length === 1 ? 0 : Math.sqrt((data.length - size) / (data.length - 1)))
        : standardError);
    }
    get('simulation-theory').textContent = theory;
    get('simulation-status').textContent = data.length ? 'Todo listo. Genera 500 muestras de tus datos.' : 'Introduce datos válidos para empezar.';
    get('simulation-detail').textContent = 'Cada barra agrupa medias de muestras.';
    emptyChart('simulation-chart', '¿Qué forma tendrán las medias?');
  }
  function tick() {
    try {
      means.push(...Laboratory.sampleMeans(data, Number(get('sample-size').value), Math.min(25, limit - means.length), random, method()));
      const summary = Statistics.calculateStatistics(means);
      drawHistogram('simulation-chart', Laboratory.histogram(means, 12, [result.min, result.max]), means.length, 'simulation-detail');
      get('simulation-count').textContent = `${means.length} / ${limit}`;
      get('simulation-progress').value = means.length;
      get('simulation-mean').textContent = fmt(summary.mean);
      get('simulation-spread').textContent = fmt(summary.standardDeviation);
      if (means.length === limit) {
        pause();
        get('simulate').textContent = 'Repetir simulación ↻';
        get('simulation-status').textContent = method() === 'systematic'
          ? '500 muestras completadas. La dispersión observada refleja el orden de tus datos.'
          : '500 muestras completadas. Cambia n y compara la dispersión teórica y observada.';
      } else timer = setTimeout(tick, 60);
    } catch (error) {
      pause();
      get('simulation-status').textContent = error.message;
      get('simulate').textContent = 'Reintentar simulación';
    }
  }
  get('simulate').addEventListener('click', () => {
    if (!data.length) return;
    if (timer !== null) {
      pause(); get('simulate').textContent = 'Continuar ▶';
      get('simulation-status').textContent = `En pausa: ${means.length} muestras. Puedes continuar o reiniciar.`;
      return;
    }
    if (means.length >= limit) resetSimulation();
    get('simulate').textContent = 'Pausar Ⅱ';
    get('simulation-status').textContent = `Simulando: ${get('sampling-method').selectedOptions[0].textContent}…`;
    tick();
  });
  get('simulation-chart').addEventListener('focusin', () => {
    if (timer !== null) {
      pause(); get('simulate').textContent = 'Continuar ▶';
      get('simulation-status').textContent = 'En pausa para explorar las barras con el teclado.';
    }
  });
  get('reset-simulation').addEventListener('click', resetSimulation);
  get('sampling-method').addEventListener('change', resetSimulation);
  get('draw-sample').addEventListener('click', () => {
    if (!data.length) return;
    try {
      const values = Laboratory.sample(data, Number(get('sample-size').value), method());
      const summary = Statistics.calculateStatistics(values);
      get('sample-values').value = values.join('; ');
      get('sample-summary').textContent = `${values.length} observaciones · media: ${fmt(summary.mean)} · mediana: ${fmt(summary.median)}. Se conservan los datos de la calculadora.`;
    } catch (error) {
      get('sample-summary').textContent = error.message;
    }
  });
  get('sample-size').addEventListener('input', () => {
    get('sample-size-value').textContent = get('sample-size').value;
    resetSimulation();
  });
  get('bins').addEventListener('input', () => { get('bins-value').textContent = get('bins').value; renderData(); });
  ['histogram', 'points'].forEach(mode => get(`view-${mode}`).addEventListener('click', () => { view = mode; renderData(); }));
  const setData = values => {
    get('numbers').value = values.join('; ');
    get('numbers').dispatchEvent(new Event('input', { bubbles: true }));
  };
  get('point-value').addEventListener('input', () => {
    const value = get('point-value').valueAsNumber;
    if (selected === null || !Number.isFinite(value)) {
      get('point-value').setAttribute('aria-invalid', 'true');
      get('point-help').textContent = 'Introduce un número válido; aún no se ha cambiado el dato.';
      return;
    }
    get('point-value').removeAttribute('aria-invalid');
    get('point-help').textContent = 'Edita este valor para ver su efecto.';
    const values = [...data]; values[selected] = value;
    // update() clears selection on text/preset changes, but preserves this editor's focus.
    const index = selected;
    setData(values);
    if (data.length) {
      selected = index;
      get('point-index').textContent = String(index + 1);
      get('point-editor').hidden = false;
      drawPoints();
    }
  });
  const presets = {
    balanced: [8, 12, 15, 10, 20, 15, 18],
    outlier: [8, 12, 15, 10, 20, 15, 90],
    skewed: [1, 1, 2, 2, 2, 3, 3, 4, 4, 5, 6, 8, 12, 18, 30, 50]
  };
  document.querySelectorAll('[data-preset]').forEach(button => button.addEventListener('click', () => setData(presets[button.dataset.preset])));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && timer !== null) {
      pause(); get('simulate').textContent = 'Continuar ▶';
      get('simulation-status').textContent = 'Simulación en pausa al ocultar la pestaña.';
    }
  });
  window.Lab = {
    update(values, statistics) {
      const changed = data.length !== (values?.length || 0) || data.some((value, i) => value !== values[i]);
      data = values ? [...values] : []; result = statistics || null;
      if (changed || !data.length) {
        if (document.activeElement !== get('point-value') || !data.length) selected = null;
        resetSimulation();
      }
      renderData();
    }
  };
})();
