import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleGenAI } from '@google/genai';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

// --- INTERFACES Y TIPOS ---
type View = 'profile' | 'tracker';
type ActivityLevel = 'Sedentario' | 'Ligero' | 'Moderado' | 'Activo' | 'Muy Activo';

interface UserProfile {
  name: string;
  age: number;
  objective: string;
  initialWeight: number;
  weightGoal: number;
}

interface DailyFoodLog {
  breakfast: string;
  lunch: string;
  snack: string;
  dinner: string;
  other: string;
}

interface DailyLog {
  weight: number;
  food: DailyFoodLog;
  mood: string;
  activityLevel: ActivityLevel;
}

interface Metrics {
  strength: string;
  measurements: string;
  bmi: string;
  dailyActivity: string;
}

interface Summary {
  content: string;
}

interface Errors {
  [key: string]: string;
}

// --- DATOS INICIALES ---
const dayNames = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

const initialDailyLog: DailyLog = {
  weight: 0,
  food: { breakfast: '', lunch: '', snack: '', dinner: '', other: '' },
  mood: '',
  activityLevel: 'Moderado',
};

const initialWeeklyLog: DailyLog[] = Array(7).fill(null).map(() => ({ ...initialDailyLog, food: { ...initialDailyLog.food } }));
const initialMetrics: Metrics = { strength: '', measurements: '', bmi: '', dailyActivity: '' };
const initialProfile: UserProfile = { name: '', age: 0, objective: '', initialWeight: 0, weightGoal: 0 };

// --- CUSTOM HOOK PARA ESTADO PERSISTENTE ---
function useStickyState<T>(defaultValue: T, key: string): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stickyValue = window.localStorage.getItem(key);
      return stickyValue !== null ? JSON.parse(stickyValue) : defaultValue;
    } catch (error) {
      console.error(`Error reading localStorage key “${key}”:`, error);
      return defaultValue;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error(`Error setting localStorage key “${key}”:`, error);
    }
  }, [key, value]);

  return [value, setValue];
}


// --- COMPONENTE PRINCIPAL ---
const App = () => {
  const [view, setView] = useStickyState<View>('profile', 'app-view');
  const [profile, setProfile] = useStickyState<UserProfile | null>(null, 'user-profile');
  const [weeklyLog, setWeeklyLog] = useStickyState<DailyLog[]>(initialWeeklyLog, 'weekly-log');
  const [metrics, setMetrics] = useStickyState<Metrics>(initialMetrics, 'user-metrics');
  const [currentDayIndex, setCurrentDayIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<'log' | 'metrics'>('log');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const summaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (profile && profile.name) {
      setView('tracker');
    }
  }, []);

  const handleProfileChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setProfile(prev => ({
        ...(prev ?? initialProfile),
        [name]: value
    }));
  };

  const validateProfile = (): boolean => {
    const newErrors: Errors = {};
    if (!profile) {
        newErrors.form = 'Por favor completa tu perfil.';
        setErrors(newErrors);
        return false;
    }
    if (!profile.name.trim()) newErrors.name = 'El nombre es obligatorio.';
    if (!profile.objective.trim()) newErrors.objective = 'El objetivo es obligatorio.';
    if (!profile.age || profile.age <= 0) newErrors.age = 'La edad debe ser un número positivo.';
    if (!profile.initialWeight || profile.initialWeight <= 0) newErrors.initialWeight = 'El peso inicial debe ser un número positivo.';
    if (!profile.weightGoal || profile.weightGoal <= 0) newErrors.weightGoal = 'El peso meta debe ser un número positivo.';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleProfileSave = () => {
    if (validateProfile()) {
      setView('tracker');
    }
  };

  const handleLogChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    const newWeeklyLog = [...weeklyLog];
    newWeeklyLog[currentDayIndex] = {
      ...newWeeklyLog[currentDayIndex],
      [name]: name === 'weight' ? parseFloat(value) : value,
    };
    setWeeklyLog(newWeeklyLog);
  };
  
  const handleFoodChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const { name, value } = e.target;
      const newWeeklyLog = [...weeklyLog];
      newWeeklyLog[currentDayIndex].food = {
          ...newWeeklyLog[currentDayIndex].food,
          [name]: value,
      };
      setWeeklyLog(newWeeklyLog);
  };

  const handleMetricsChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setMetrics(prev => ({ ...prev, [name]: value }));
  };
  
  const handleNewWeek = () => {
    if (window.confirm("¿Estás seguro de que quieres empezar una nueva semana? Se borrarán todos los datos del registro actual.")) {
        setWeeklyLog(initialWeeklyLog);
        setMetrics(initialMetrics);
        setSummary(null);
        setCurrentDayIndex(0);
    }
  };

  const generateSummary = async () => {
    setLoading(true);
    setSummary(null);

    const hasData = weeklyLog.some(day => day.weight > 0 || Object.values(day.food).some(f => f) || day.mood) || Object.values(metrics).some(m => m);
    if (!hasData) {
        alert("Por favor, introduce algunos datos antes de generar un resumen.");
        setLoading(false);
        return;
    }

    const ai = new GoogleGenAI({ apiKey: '__API_KEY__' });
    
    const prompt = `
      DATOS DEL USUARIO:
      - Nombre: ${profile?.name || 'No especificado'}
      - Edad: ${profile?.age || 'No especificado'}
      - Objetivo Principal: ${profile?.objective || 'No especificado'}
      - Peso Inicial: ${profile?.initialWeight || 'No especificado'} kg
      - Peso Meta: ${profile?.weightGoal || 'No especificado'} kg
      
      DATOS DE LA SEMANA:
      ${weeklyLog.map((day, index) => {
          const dayData = [
              day.weight > 0 && `Peso: ${day.weight} kg`,
              Object.values(day.food).some(f => f) && `Comidas: Desayuno(${day.food.breakfast}), Almuerzo(${day.food.lunch}), Merienda(${day.food.snack}), Cena(${day.food.dinner}), Otros(${day.food.other})`,
              day.mood && `Sensaciones: ${day.mood}`,
              `Nivel de Actividad: ${day.activityLevel}`
          ].filter(Boolean).join('; ');
          return dayData ? `- ${dayNames[index]}: ${dayData}` : '';
      }).filter(Boolean).join('\n')}

      DATOS DE MÉTRICAS Y ACTIVIDAD FÍSICA:
      - Fuerza: ${metrics.strength || 'No registrado'}
      - Medidas: ${metrics.measurements || 'No registrado'}
      - BMI: ${metrics.bmi || 'No registrado'}
      - Actividad Física Detallada: ${metrics.dailyActivity || 'No registrado'}

      INSTRUCCIONES PARA EL INFORME:
      Actúa como un coach de bienestar profesional. Genera un informe semanal detallado en formato HTML.
      El informe DEBE tener la siguiente estructura:
      1.  Un título principal: "<h3>¡Tu Informe Semanal de Bienestar y Progreso!</h3>".
      2.  Un párrafo de introducción motivador.
      3.  Una sección "<h4>1. Datos del Usuario</h4>" seguida de una tabla HTML (<table>) que resuma los "DATOS DEL USUARIO" de arriba. La tabla debe tener dos columnas: "Dato" y "Valor".
      4.  Si los datos del perfil no están completos, añade un "Consejo del Experto" en un párrafo para animar a completarlos.
      5.  Una sección "<h4>2. Análisis Diario</h4>". Para CADA DÍA que tenga datos, crea un subtítulo "<h5>[Nombre del Día]</h5>" y debajo, en un párrafo o lista, un breve análisis que integre el peso, las comidas, las sensaciones y la actividad de ese día. Sé conciso y extrae conclusiones.
      6.  Una sección "<h4>3. Resumen General y Recomendaciones</h4>". Aquí, escribe un análisis holístico de la semana, conectando los datos diarios, las métricas y los objetivos del usuario. Ofrece conclusiones y 2-3 recomendaciones claras y prácticas para la próxima semana.
      7.  Utiliza etiquetas <strong> para resaltar datos numéricos clave. Utiliza <ul> y <li> para las recomendaciones.
      8.  El tono debe ser de apoyo, profesional y motivador.
      9.  NO incluyas ninguna parte de estas instrucciones en tu respuesta. Solo el HTML del informe.
    `;


    try {
      const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });
      setSummary({ content: result.text });
    } catch (error) {
      console.error(error);
      alert("Hubo un error al generar el resumen. Por favor, inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  const handleShareSummary = async () => {
    if (!summaryRef.current || !profile) return;
    const doc = new jsPDF();
    const summaryElement = summaryRef.current;

    const addFooters = () => {
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(150);
            doc.text(
                `Informe generado para ${profile.name} el ${new Date().toLocaleDateString()}`,
                doc.internal.pageSize.getWidth() / 2,
                doc.internal.pageSize.getHeight() - 10,
                { align: 'center' }
            );
            doc.text(
                `Página ${i} de ${pageCount}`,
                doc.internal.pageSize.getWidth() - 20,
                doc.internal.pageSize.getHeight() - 10
            );
        }
    };

    doc.setFontSize(18);
    doc.setTextColor(40);
    doc.text("Informe Semanal de Bienestar y Progreso", 14, 22);

    const profileData = [
        { title: 'Nombre', value: profile.name },
        { title: 'Edad', value: profile.age ? `${profile.age}` : 'No especificado' },
        { title: 'Objetivo Principal', value: profile.objective },
        { title: 'Peso Inicial', value: `${profile.initialWeight} kg` },
        { title: 'Peso Meta', value: `${profile.weightGoal} kg` },
    ];
    
    (doc as any).autoTable({
        startY: 30,
        head: [['Dato', 'Valor']],
        body: profileData.map(d => [d.title, d.value]),
        theme: 'grid',
        headStyles: { fillColor: [22, 72, 99], textColor: 255 },
        alternateRowStyles: { fillColor: [245, 245, 245] },
        didParseCell: function (data: any) {
            if (data.column.index === 0 && data.cell.section === 'body') {
                data.cell.styles.fontStyle = 'bold';
            }
        }
    });
    
    let finalY = (doc as any).lastAutoTable.finalY || 60;

    // --- Progress Bar ---
    const lastWeight = weeklyLog.filter(d => d.weight > 0).pop()?.weight ?? profile.initialWeight;
    const { progress, progressText } = calculateProgress(profile.initialWeight, lastWeight, profile.weightGoal);
    
    doc.setFontSize(10);
    doc.text("Progreso hacia tu Meta", 14, finalY + 10);
    doc.setFillColor(230, 230, 230);
    doc.rect(14, finalY + 12, 180, 8, 'F');
    doc.setFillColor(34, 139, 230);
    doc.rect(14, finalY + 12, 180 * (progress / 100), 8, 'F');
    doc.setTextColor(80);
    doc.text(progressText, 14, finalY + 25);
    finalY += 30;
    
    // --- AI Summary ---
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = summary?.content || '';

    doc.html(tempDiv, {
        x: 14,
        y: finalY + 5,
        width: 180,
        windowWidth: 600,
        callback: () => {
            addFooters();
            doc.save(`resumen_fitness_${profile.name.replace(/\s/g, '_')}.pdf`);
        }
    });
  };

  const calculateProgress = (initial: number, current: number, goal: number) => {
      if (initial === goal) return { progress: 100, progressText: "¡Ya estás en tu peso meta!" };
      
      const totalDistance = Math.abs(goal - initial);
      const distanceCovered = goal > initial ? current - initial : initial - current;
      let progress = (distanceCovered / totalDistance) * 100;
      progress = Math.max(0, Math.min(progress, 100));
      
      let progressText = '';
      const diff = Math.abs(current - goal);

      if (goal > initial) { // Ganar peso
        if(current >= goal) progressText = `¡Felicidades! Has alcanzado y superado tu meta por ${Math.abs(current - goal).toFixed(2)} kg.`;
        else if (current >= initial) progressText = `Has ganado ${Math.abs(current - initial).toFixed(2)} kg. ¡Te faltan ${diff.toFixed(2)} kg para tu meta!`;
        else progressText = `Has perdido ${Math.abs(current - initial).toFixed(2)} kg. Estás a ${diff.toFixed(2)} kg de tu meta.`;
      } else { // Perder peso
        if(current <= goal) progressText = `¡Felicidades! Has alcanzado y superado tu meta por ${Math.abs(current - goal).toFixed(2)} kg.`;
        else if (current <= initial) progressText = `Has perdido ${Math.abs(initial - current).toFixed(2)} kg. ¡Te faltan ${diff.toFixed(2)} kg para tu meta!`;
        else progressText = `Has ganado ${Math.abs(current - initial).toFixed(2)} kg. Estás a ${diff.toFixed(2)} kg de tu meta.`;
      }
      
      return { progress, progressText };
  };


  if (view === 'profile' || !profile) {
    return <ProfileScreen profile={profile} onChange={handleProfileChange} onSave={handleProfileSave} errors={errors} />;
  }

  return (
    <TrackerScreen
      profile={profile}
      setView={setView}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      currentDayIndex={currentDayIndex}
      setCurrentDayIndex={setCurrentDayIndex}
      weeklyLog={weeklyLog}
      handleLogChange={handleLogChange}
      handleFoodChange={handleFoodChange}
      metrics={metrics}
      handleMetricsChange={handleMetricsChange}
      summary={summary}
      loading={loading}
      generateSummary={generateSummary}
      summaryRef={summaryRef}
      handleShareSummary={handleShareSummary}
      calculateProgress={calculateProgress}
      handleNewWeek={handleNewWeek}
    />
  );
};


// --- SUB-COMPONENTES ---

const ProfileScreen = ({ profile, onChange, onSave, errors }: { profile: UserProfile | null, onChange: any, onSave: any, errors: Errors }) => {
  return (
    <div className="app-container">
      <div className="card">
        <h1>Crea tu Perfil</h1>
        <p>Completa tus datos para personalizar tu experiencia y empezar a registrar tu progreso.</p>
        <div className="form-group">
          <label htmlFor="name">Nombre</label>
          <input type="text" id="name" name="name" value={profile?.name || ''} onChange={onChange} className={errors.name ? 'input-error' : ''} />
          {errors.name && <p className="error-message">{errors.name}</p>}
        </div>
        <div className="form-group">
          <label htmlFor="age">Edad</label>
          <input type="number" id="age" name="age" value={profile?.age || ''} onChange={onChange} className={`no-spinner ${errors.age ? 'input-error' : ''}`} min="0" />
          {errors.age && <p className="error-message">{errors.age}</p>}
        </div>
        <div className="form-group">
          <label htmlFor="objective">Objetivo Principal</label>
          <textarea id="objective" name="objective" value={profile?.objective || ''} onChange={onChange} className={errors.objective ? 'input-error' : ''}></textarea>
          {errors.objective && <p className="error-message">{errors.objective}</p>}
        </div>
        <div className="form-group">
          <label htmlFor="initialWeight">Peso Inicial (kg)</label>
          <input type="number" id="initialWeight" name="initialWeight" value={profile?.initialWeight || ''} onChange={onChange} className={`no-spinner ${errors.initialWeight ? 'input-error' : ''}`} min="0" />
          {errors.initialWeight && <p className="error-message">{errors.initialWeight}</p>}
        </div>
        <div className="form-group">
            <label htmlFor="weightGoal">Peso Meta (kg)</label>
            <input type="number" id="weightGoal" name="weightGoal" value={profile?.weightGoal || ''} onChange={onChange} className={`no-spinner ${errors.weightGoal ? 'input-error' : ''}`} min="0" />
            {errors.weightGoal && <p className="error-message">{errors.weightGoal}</p>}
        </div>
        <button onClick={onSave} className="btn">Guardar y Continuar</button>
      </div>
    </div>
  );
};

const TrackerScreen = (props: any) => {
  const {
    profile, setView, activeTab, setActiveTab, currentDayIndex, setCurrentDayIndex, weeklyLog,
    handleLogChange, handleFoodChange, metrics, handleMetricsChange, summary, loading, generateSummary,
    summaryRef, handleShareSummary, calculateProgress, handleNewWeek
  } = props;
  
  const lastWeight = weeklyLog.filter(d => d.weight > 0).pop()?.weight ?? profile.initialWeight;
  const { progress, progressText } = calculateProgress(profile.initialWeight, lastWeight, profile.weightGoal);

  return (
    <div className="app-container">
      <header className="header">
        <h1>Hola, {profile.name}!</h1>
        <div className="header-buttons">
            <button className="edit-profile-button" onClick={() => setView('profile')}>Mi Perfil</button>
            <button className="new-week-button" onClick={handleNewWeek}>Empezar Nueva Semana</button>
        </div>
      </header>
      <div className="tabs">
        <button className={`tab-button ${activeTab === 'log' ? 'active' : ''}`} onClick={() => setActiveTab('log')}>Registro Semanal</button>
        <button className={`tab-button ${activeTab === 'metrics' ? 'active' : ''}`} onClick={() => setActiveTab('metrics')}>Métricas y Actividad</button>
      </div>

      {activeTab === 'log' && (
        <div className="card">
            <div className="day-navigation">
                <button onClick={() => setCurrentDayIndex(p => Math.max(0, p - 1))} disabled={currentDayIndex === 0}>&larr;</button>
                <h2>{dayNames[currentDayIndex]}</h2>
                <button onClick={() => setCurrentDayIndex(p => Math.min(6, p + 1))} disabled={currentDayIndex === 6}>&rarr;</button>
            </div>
            
            <div className="form-group">
                <label htmlFor="weight">Peso en Ayunas (kg)</label>
                <input type="number" id="weight" name="weight" value={weeklyLog[currentDayIndex].weight || ''} onChange={handleLogChange} className="no-spinner" min="0"/>
            </div>
            
            <label>Comidas del Día</label>
            <div className="form-group-grid">
                <input type="text" name="breakfast" placeholder="Desayuno" value={weeklyLog[currentDayIndex].food.breakfast} onChange={handleFoodChange} />
                <input type="text" name="lunch" placeholder="Almuerzo" value={weeklyLog[currentDayIndex].food.lunch} onChange={handleFoodChange} />
                <input type="text" name="snack" placeholder="Merienda" value={weeklyLog[currentDayIndex].food.snack} onChange={handleFoodChange} />
                <input type="text" name="dinner" placeholder="Cena" value={weeklyLog[currentDayIndex].food.dinner} onChange={handleFoodChange} />
                <input type="text" name="other" placeholder="Aperitivos u Otros" value={weeklyLog[currentDayIndex].food.other} onChange={handleFoodChange} />
            </div>

            <div className="form-group">
                <label htmlFor="activityLevel">Nivel de Actividad del Día</label>
                <select name="activityLevel" id="activityLevel" value={weeklyLog[currentDayIndex].activityLevel} onChange={handleLogChange}>
                    <option value="Sedentario">Sedentario (poco o ningún ejercicio)</option>
                    <option value="Ligero">Ligero (ejercicio 1-3 días/semana)</option>
                    <option value="Moderado">Moderado (ejercicio 3-5 días/semana)</option>
                    <option value="Activo">Activo (ejercicio 6-7 días/semana)</option>
                    <option value="Muy Activo">Muy Activo (ejercicio intenso/trabajo físico)</option>
                </select>
            </div>

            <div className="form-group">
                <label htmlFor="mood">Sensaciones Durante el Día</label>
                <textarea id="mood" name="mood" value={weeklyLog[currentDayIndex].mood} onChange={handleLogChange} placeholder="¿Cómo te sentiste hoy? (energía, estado de ánimo, etc.)"></textarea>
            </div>
        </div>
      )}

      {activeTab === 'metrics' && (
        <div className="card">
          <h2>Métricas y Actividad</h2>
          <div className="form-group">
            <label htmlFor="strength">Registro de Fuerza</label>
            <textarea id="strength" name="strength" value={metrics.strength} onChange={handleMetricsChange} placeholder="Ej: Press de banca: 3x5 80kg"></textarea>
          </div>
          <div className="form-group">
            <label htmlFor="measurements">Medidas Corporales (cm)</label>
            <textarea id="measurements" name="measurements" value={metrics.measurements} onChange={handleMetricsChange} placeholder="Ej: Cintura: 85cm, Bíceps: 35cm"></textarea>
          </div>
          <div className="form-group">
            <label htmlFor="bmi">BMI (Índice de Masa Corporal)</label>
            <input type="text" id="bmi" name="bmi" value={metrics.bmi} onChange={handleMetricsChange} />
          </div>
          <div className="form-group">
            <label htmlFor="dailyActivity">Actividad Física Detallada</label>
            <textarea id="dailyActivity" name="dailyActivity" value={metrics.dailyActivity} onChange={handleMetricsChange} placeholder="Describe tus entrenamientos de la semana"></textarea>
          </div>
        </div>
      )}
      
      <div className="card summary-card">
          <button onClick={generateSummary} className="btn" disabled={loading}>
              {loading ? <div className="spinner"></div> : 'Generar Resumen Semanal'}
          </button>
          
          {summary && (
              <div className="summary-section" ref={summaryRef}>
                  <WeightGoalProgress initial={profile.initialWeight} current={lastWeight} goal={profile.weightGoal} progress={progress} progressText={progressText} />
                  <div dangerouslySetInnerHTML={{ __html: summary.content }}></div>
              </div>
          )}
          {summary && !loading && <button className="btn share-button" onClick={handleShareSummary}>Descargar Resumen (PDF)</button>}
      </div>
    </div>
  );
};

const WeightGoalProgress = ({ initial, current, goal, progress, progressText }: any) => {
    return(
        <div className="progress-container">
            <h3>Tu Progreso de Peso</h3>
            <div className="progress-labels">
                <span>Inicial: {initial} kg</span>
                <span className="current-weight-label">Actual: {current} kg</span>
                <span>Meta: {goal} kg</span>
            </div>
            <div className="progress-bar-bg">
                <div className="progress-bar-fg" style={{ width: `${progress}%` }}></div>
            </div>
            <p className="progress-summary-text">{progressText}</p>
        </div>
    );
};


const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<App />);
