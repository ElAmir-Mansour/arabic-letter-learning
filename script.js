(async function() {
    'use strict';

    document.addEventListener('DOMContentLoaded', async () => {
        // --- THEME TOGGLE ---
        const themeToggle = document.getElementById('theme-toggle');
        const docElement = document.documentElement;

        themeToggle.addEventListener('click', () => {
            docElement.classList.toggle('dark');
            const isDark = docElement.classList.contains('dark');
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
        });

        // --- CORE APP REFERENCES ---
        const letterSelect = document.getElementById('letter-select');
        const contextOptions = document.getElementById('context-options');
        const svgContainer = document.getElementById('svg-container');
        const drawButton = document.getElementById('draw-button');
        const audioButton = document.getElementById('audio-button');
        const canvas = document.getElementById('practice-pad');
        const ctx = canvas.getContext('2d');
        const clearButton = document.getElementById('clear-button');
        const analyzeButton = document.getElementById('analyze-button');
        const feedbackPanel = document.getElementById('feedback-panel');

        // --- APP STATE ---
        let currentLetterKey = 'U+0628'; // Default to Baa
        let currentForm = 'isolated';
        let isDrawing = false;
        let userStroke = [];
        let glyphDatabase = null;
        let userName = localStorage.getItem('userName') || '';
        
        // --- GAMIFICATION STATE ---
        let userProgress = loadProgress();
        console.log('User progress initialized:', userProgress);
        
        function loadProgress() {
            const saved = localStorage.getItem('arabicLetterProgress');
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    // Ensure all required fields exist
                    return {
                        letters: parsed.letters || {},
                        totalStars: parsed.totalStars || 0,
                        totalPoints: parsed.totalPoints || 0,
                        practiceTime: parsed.practiceTime || 0,
                        startDate: parsed.startDate || new Date().toISOString()
                    };
                } catch (e) {
                    console.error('Failed to parse saved progress:', e);
                }
            }
            return {
                letters: {},
                totalStars: 0,
                totalPoints: 0,
                practiceTime: 0,
                startDate: new Date().toISOString()
            };
        }
        
        function saveProgress() {
            localStorage.setItem('arabicLetterProgress', JSON.stringify(userProgress));
            updateProgressUI();
        }
        
        function getLetterProgress(letterKey) {
            // Ensure userProgress and letters object exist
            if (!userProgress) {
                console.error('userProgress is not initialized');
                userProgress = {
                    letters: {},
                    totalStars: 0,
                    totalPoints: 0,
                    practiceTime: 0,
                    startDate: new Date().toISOString()
                };
            }
            
            if (!userProgress.letters) {
                userProgress.letters = {};
            }
            
            if (!userProgress.letters[letterKey]) {
                userProgress.letters[letterKey] = {
                    attempts: 0,
                    bestScore: 0,
                    stars: 0,
                    completed: false,
                    lastAttempt: null
                };
            }
            return userProgress.letters[letterKey];
        }
        
        function updateLetterProgress(letterKey, score) {
            const letterProgress = getLetterProgress(letterKey);
            letterProgress.attempts++;
            letterProgress.lastAttempt = new Date().toISOString();
            
            // Calculate stars based on score
            let stars = 0;
            if (score >= 0.95) stars = 3;
            else if (score >= 0.85) stars = 2;
            else if (score >= 0.70) stars = 1;
            
            // Update best score and stars
            if (score > letterProgress.bestScore) {
                letterProgress.bestScore = score;
                letterProgress.stars = Math.max(letterProgress.stars, stars);
            }
            
            // Mark as completed if got at least 1 star
            if (stars > 0) {
                letterProgress.completed = true;
            }
            
            // Calculate points
            const basePoints = Math.round(score * 100);
            const starBonus = stars * 50;
            const points = basePoints + starBonus;
            
            userProgress.totalPoints += points;
            
            // Recalculate total stars
            userProgress.totalStars = Object.values(userProgress.letters)
                .reduce((sum, letter) => sum + letter.stars, 0);
            
            saveProgress();
            
            return { stars, points };
        }
        
        function updateProgressUI() {
            // Ensure userProgress.letters exists
            if (!userProgress || !userProgress.letters) {
                console.warn('userProgress.letters not initialized');
                return;
            }
            
            const completedLetters = Object.values(userProgress.letters)
                .filter(l => l.completed).length;
            const totalLetters = 28;
            const progressPercent = (completedLetters / totalLetters) * 100;
            
            const progressBar = document.getElementById('progress-bar');
            const progressText = document.getElementById('progress-text');
            const totalStarsEl = document.getElementById('total-stars');
            const totalPointsEl = document.getElementById('total-points');
            
            if (progressBar) progressBar.style.width = `${progressPercent}%`;
            if (progressText) progressText.textContent = `${completedLetters}/${totalLetters}`;
            if (totalStarsEl) totalStarsEl.textContent = userProgress.totalStars || 0;
            if (totalPointsEl) totalPointsEl.textContent = userProgress.totalPoints || 0;
            
            // Update letter-specific stars display
            if (glyphDatabase && currentLetterKey) {
                const letterProgress = getLetterProgress(currentLetterKey);
                const letterStarsEl = document.getElementById('letter-stars');
                if (letterStarsEl) {
                    const starsDisplay = '⭐'.repeat(letterProgress.stars) + '☆'.repeat(3 - letterProgress.stars);
                    letterStarsEl.textContent = starsDisplay;
                }
            }
        }

        // --- TEXT-TO-SPEECH FUNCTIONALITY ---
        const speechSynth = window.speechSynthesis;
        
        function speak(text, lang = 'ar-SA') {
            if (!speechSynth) {
                console.warn('Speech synthesis not supported');
                return;
            }
            
            // Cancel any ongoing speech
            speechSynth.cancel();
            
            // Personalize with user's name if available
            let personalizedText = text;
            if (userName && lang.startsWith('ar')) {
                // Add name for encouragement messages
                if (text.includes('ممتاز') || text.includes('جيد') || text.includes('رائع')) {
                    personalizedText = `${text} يا ${userName}`;
                }
            }
            
            const utterance = new SpeechSynthesisUtterance(personalizedText);
            utterance.lang = lang;
            utterance.rate = 0.8;
            utterance.pitch = 1.0;
            utterance.volume = 1.0;
            
            // Try to find an Arabic voice
            const voices = speechSynth.getVoices();
            const arabicVoice = voices.find(voice => voice.lang.startsWith('ar') || voice.lang.startsWith('ar-'));
            if (arabicVoice) {
                utterance.voice = arabicVoice;
            }
            
            speechSynth.speak(utterance);
        }
        
        function speakLetter(letterKey) {
            if (!glyphDatabase || !glyphDatabase[letterKey]) return;
            
            const letterData = glyphDatabase[letterKey];
            const arabicChar = letterData.char;
            
            // Speak the Arabic letter character
            speak(arabicChar, 'ar-SA');
        }

        async function loadGlyphData() {
            try {
                const response = await fetch('glyph-data.json');
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                glyphDatabase = await response.json();
                console.log('Glyph data loaded successfully.');
            } catch (error) {
                console.error('Failed to load glyph data:', error);
                feedbackPanel.textContent = 'Error: Could not load letter data. Please refresh the page.';
            }
        }

        // --- ANALYSIS LOGIC ---

        class DTWAnalyzer {
            constructor(userStroke, templateStroke) {
                this.userStroke = this.normalizeStroke(userStroke);
                this.templateStroke = this.normalizeStroke(templateStroke);
                this.dtw = new DTWAnalyzer.DynamicTimeWarping(this.userStroke, this.templateStroke, this.enhancedDistance.bind(this));
            }
            
            normalizeStroke(stroke) {
                if (stroke.length === 0) return [];
                const xs = stroke.map(p => p.x);
                const ys = stroke.map(p => p.y);
                const minX = Math.min(...xs), maxX = Math.max(...xs);
                const minY = Math.min(...ys), maxY = Math.max(...ys);
                const scale = Math.max(maxX - minX, maxY - minY) || 1;
                const centerX = (minX + maxX) / 2;
                const centerY = (minY + maxY) / 2;
                
                return stroke.map(p => ({
                    x: (p.x - centerX) / scale,
                    y: (p.y - centerY) / scale,
                    t: p.t || 0
                }));
            }
            
            euclideanDistance(p1, p2) {
                return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
            }
            
            getDirection(index, stroke) {
                if (stroke.length < 2) return 0;
                if (index === 0 && stroke.length > 1) {
                    return Math.atan2(stroke[1].y - stroke[0].y, stroke[1].x - stroke[0].x);
                }
                if (index >= stroke.length - 1 && stroke.length > 1) {
                    return Math.atan2(stroke[index].y - stroke[index-1].y, stroke[index].x - stroke[index-1].x);
                }
                return Math.atan2(stroke[index+1].y - stroke[index-1].y, stroke[index+1].x - stroke[index-1].x);
            }
            
            enhancedDistance(p1, p2) {
                if (!p1 || !p2) return 1;
                const spatialDist = this.euclideanDistance(p1, p2);
                return spatialDist;
            }
            
            compute() {
                const distance = this.dtw.getDistance();
                const path = this.dtw.getPath();
                if (path.length === 0) return 0;
                const normalizedDistance = distance / path.length;
                const score = Math.max(0, Math.min(1, 1 - normalizedDistance * 2));
                return score;
            }
        }
        DTWAnalyzer.DynamicTimeWarping = function(a,b,c){var d,e,f,g=a,h=b,i=c,j=function(){if(void 0!==d)return d;e=[];for(var a=0;a<g.length;a++){e[a]=[];for(var b=0;b<h.length;b++){var c=1/0;a>0?(c=Math.min(c,e[a-1][b]),b>0&&(c=Math.min(c,e[a-1][b-1]),c=Math.min(c,e[a][b-1]))):c=b>0?Math.min(c,e[a][b-1]):0,e[a][b]=c+i(g[a],h[b])}}return e[g.length-1][h.length-1]};this.getDistance=j;var k=function(){if(void 0!==f)return f;void 0===e&&j();var a=g.length-1,b=h.length-1;for(f=[[a,b]];a>0||b>0;)a>0?b>0?e[a-1][b]<e[a-1][b-1]?e[a-1][b]<e[a][b-1]?(f.push([a-1,b]),a--):(f.push([a,b-1]),b--):e[a-1][b-1]<e[a][b-1]?(f.push([a-1,b-1]),a--,b--):(f.push([a,b-1]),b--):(f.push([a-1,b]),a--):(f.push([a,b-1]),b--);return f=f.reverse()};this.getPath=k};

        function getTemplateStroke(rasmPathArray, numPoints) {
            const combinedPath = rasmPathArray.join(' ');
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', combinedPath);
            const totalLength = path.getTotalLength();
            const points = [];
            if (totalLength === 0) return [];
            for (let i = 0; i < numPoints; i++) {
                const point = path.getPointAtLength(i / (numPoints - 1) * totalLength);
                points.push({ x: point.x, y: point.y });
            }
            return points;
        }

        function runDTWAnalysis(processedStroke) {
            const letterName = glyphDatabase[currentLetterKey].name;
            const form = glyphDatabase[currentLetterKey].forms[currentForm];
            
            const numPoints = Math.min(processedStroke.length, 100);
            const templateStroke = getTemplateStroke(form.rasm, numPoints);
            if (templateStroke.length === 0) {
                return { score: 0, feedbackText: `Analysis for ${letterName} is not available.`, errorRegions: [] };
            }

            const analyzer = new DTWAnalyzer(processedStroke, templateStroke);
            const score = analyzer.compute();
            
            const directionAnalysis = analyzeDirection(processedStroke);
            let feedbackText;
            
            if (!directionAnalysis.isRTL && directionAnalysis.consistency < 0.6) {
                feedbackText = `⚠️ ${letterName}: Try drawing from right to left (RTL direction is essential in Arabic)`;
            } else if (score >= 0.85) {
                feedbackText = `🌟 Excellent! Your ${letterName} matches the template very closely. Keep it up!`;
            } else if (score >= 0.70) {
                feedbackText = `✓ Good work on ${letterName}! ${directionAnalysis.consistency < 0.8 ? 'Maintain consistent right-to-left direction.' : 'Try to match the curves more precisely.'}`;
            } else if (score >= 0.50) {
                feedbackText = `↗️ Getting there with ${letterName}. Focus on: ${directionAnalysis.consistency < 0.7 ? 'proper RTL direction and ' : ''}following the template shape more closely.`;
            } else {
                feedbackText = `⟳ Keep practicing ${letterName}. Tips: Start from the right, follow the template outline, and maintain smooth curves.`;
            }
            return { score: score, feedbackText: feedbackText, errorRegions: [] };
        }
        
        function analyzeDirection(stroke) {
            if (stroke.length < 10) return { isRTL: true, consistency: 1 };
            
            let rtlSegments = 0;
            let totalSegments = 0;
            
            for (let i = 0; i < stroke.length - 5; i += 5) {
                const dx = stroke[i + 5].x - stroke[i].x;
                if (Math.abs(dx) > 3) {
                    totalSegments++;
                    if (dx < 0) rtlSegments++;
                }
            }
            
            const consistency = totalSegments > 0 ? rtlSegments / totalSegments : 1;
            const isRTL = consistency > 0.5;
            
            return { isRTL, consistency };
        }

        async function analyzeStroke(strokeData) {
            console.log('Starting stroke analysis...');
            
            feedbackPanel.textContent = 'جاري تحليل رسمك...';
            feedbackPanel.className = 'w-full min-h-[6rem] h-auto bg-blue-100 p-4 rounded-lg flex flex-col items-center justify-center text-center font-medium text-blue-700 transition-all';
            analyzeButton.disabled = true;

            const processedStroke = strokeData.map(p => ({ x: p.x, y: p.y, t: p.t }));
            await new Promise(resolve => setTimeout(resolve, 100));
            const feedback = runDTWAnalysis(processedStroke);
            
            // Update progress and get rewards
            const rewards = updateLetterProgress(currentLetterKey, feedback.score);
            
            let feedbackClass = '';
            let emoji = '';
            let message = '';
            
            if (feedback.score >= 0.95) {
                feedbackClass = 'bg-green-100 text-green-700';
                emoji = '🌟';
                message = 'ممتاز جداً!';
                speak('ممتاز جداً! أداء رائع!', 'ar-SA');
            } else if (feedback.score >= 0.85) {
                feedbackClass = 'bg-green-100 text-green-700';
                emoji = '✨';
                message = 'ممتاز!';
                speak('ممتاز! عمل جيد!', 'ar-SA');
            } else if (feedback.score >= 0.70) {
                feedbackClass = 'bg-yellow-100 text-yellow-700';
                emoji = '👍';
                message = 'جيد';
                speak('جيد، استمر!', 'ar-SA');
            } else if (feedback.score >= 0.50) {
                feedbackClass = 'bg-orange-100 text-orange-700';
                emoji = '💪';
                message = 'لا بأس';
                speak('لا بأس، حاول مرة أخرى', 'ar-SA');
            } else {
                feedbackClass = 'bg-red-100 text-red-700';
                emoji = '🔄';
                message = 'حاول مرة أخرى';
                speak('حاول مرة أخرى', 'ar-SA');
            }
            
            feedbackPanel.innerHTML = `
                <div class="text-3xl mb-2">${emoji}</div>
                <div class="text-xl font-bold mb-2">${message}</div>
                <div class="text-lg mb-2">النتيجة: ${Math.round(feedback.score * 100)}%</div>
                ${rewards.stars > 0 ? `<div class="text-2xl mb-2">${'⭐'.repeat(rewards.stars)}</div>` : ''}
                <div class="text-sm">+${rewards.points} نقطة</div>
            `;
            feedbackPanel.className = `w-full min-h-[6rem] h-auto p-4 rounded-lg flex flex-col items-center justify-center text-center font-medium ${feedbackClass} transition-all`;
            
            // Show stars animation if earned
            if (rewards.stars > 0) {
                showStarsAnimation(rewards.stars);
            }
            
            analyzeButton.disabled = false;
            setTimeout(() => {
                if (!isDrawing) clearPad();
            }, 5000);
        }
        
        function showStarsAnimation(stars) {
            const starsDisplay = document.getElementById('stars-display');
            starsDisplay.textContent = '⭐'.repeat(stars);
            starsDisplay.classList.remove('hidden');
            setTimeout(() => {
                starsDisplay.classList.add('hidden');
            }, 3000);
        }


        // --- UI & CANVAS LOGIC ---
        function resizeCanvas() {
            const dpr = window.devicePixelRatio || 1;
            const rect = canvas.getBoundingClientRect();
            
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
            
            ctx.scale(dpr, dpr);
            canvas.style.width = rect.width + 'px';
            canvas.style.height = rect.height + 'px';
            
            drawTemplateOnCanvas();
        }

        function updateContextOptions() {
            currentLetterKey = letterSelect.value;
            const forms = glyphDatabase[currentLetterKey].forms;
            contextOptions.innerHTML = '';
            let isFirst = true;
            Object.entries(forms).forEach(([formKey, formData]) => {
                const div = document.createElement('div');
                div.className = 'flex items-center';
                const input = document.createElement('input');
                input.type = 'radio';
                input.id = `form-${formKey}`;
                input.name = 'context-form';
                input.value = formKey;
                input.className = 'ml-2 h-4 w-4 text-emerald-600 focus:ring-emerald-500 border-gray-300';
                if (isFirst) {
                    input.checked = true;
                    currentForm = formKey;
                    isFirst = false;
                }
                input.addEventListener('change', () => {
                    currentForm = input.value;
                    updateSvgAnimation();
                    clearPad();
                });
                const label = document.createElement('label');
                label.htmlFor = `form-${formKey}`;
                label.textContent = formData.label || formKey;
                label.className = 'mr-1 text-gray-700';
                div.appendChild(input);
                div.appendChild(label);
                contextOptions.appendChild(div);
            });
            updateSvgAnimation();
            updateProgressUI();
        }
        
        function showStatistics() {
            if (!glyphDatabase) {
                console.error('Glyph database not loaded yet');
                return;
            }
            
            if (!userProgress || !userProgress.letters) {
                console.error('User progress not initialized');
                return;
            }
            
            const modal = document.getElementById('stats-modal');
            if (modal) modal.classList.remove('hidden');
            
            const completedLetters = Object.entries(userProgress.letters)
                .filter(([key, data]) => data.completed);
            const totalAttempts = Object.values(userProgress.letters)
                .reduce((sum, letter) => sum + letter.attempts, 0);
            const avgScore = completedLetters.length > 0
                ? completedLetters.reduce((sum, [key, data]) => sum + data.bestScore, 0) / completedLetters.length
                : 0;
            
            const statsCompleted = document.getElementById('stats-completed');
            const statsTotalStars = document.getElementById('stats-total-stars');
            const statsAvgScore = document.getElementById('stats-avg-score');
            const statsTime = document.getElementById('stats-time');
            
            if (statsCompleted) statsCompleted.textContent = completedLetters.length;
            if (statsTotalStars) statsTotalStars.textContent = userProgress.totalStars;
            if (statsAvgScore) statsAvgScore.textContent = Math.round(avgScore * 100) + '%';
            if (statsTime) statsTime.textContent = Math.round(userProgress.practiceTime / 60);
            
            const completedLettersEl = document.getElementById('completed-letters');
            if (completedLettersEl) {
                if (completedLetters.length > 0) {
                    completedLettersEl.innerHTML = completedLetters.map(([key, data]) => {
                        const letter = glyphDatabase[key];
                        if (!letter) return '';
                        return `<span class="px-3 py-2 rounded-lg text-lg font-bold" style="background: linear-gradient(135deg, #faf9f7 0%, #f5f3f0 100%); border: 2px solid #BDBAB2;">
                            ${letter.char} ${'⭐'.repeat(data.stars)}
                        </span>`;
                    }).filter(html => html).join('');
                } else {
                    completedLettersEl.innerHTML = '<span class="text-sm" style="color: #BDBAB2;">لم تكمل أي حرف بعد</span>';
                }
            }
            
            speak('الإحصائيات', 'ar-SA');
        }
        
        function hideStatistics() {
            document.getElementById('stats-modal').classList.add('hidden');
        }
        
        function resetProgress() {
            if (confirm('هل أنت متأكد من إعادة تعيين كل التقدم؟')) {
                localStorage.removeItem('arabicLetterProgress');
                userProgress = loadProgress();
                updateProgressUI();
                hideStatistics();
                speak('تم إعادة تعيين التقدم', 'ar-SA');
            }
        }
        
        function exportStatistics() {
            if (!userProgress || !userProgress.letters) {
                console.error('User progress not initialized');
                return;
            }
            
            const data = {
                ...userProgress,
                exportDate: new Date().toISOString(),
                letterDetails: glyphDatabase ? Object.entries(userProgress.letters).map(([key, data]) => ({
                    letter: glyphDatabase[key]?.char || key,
                    name: glyphDatabase[key]?.name || key,
                    ...data
                })) : []
            };
            
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `arabic-letters-progress-${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
            
            speak('تم التصدير', 'ar-SA');
        }

        function updateSvgAnimation() {
            const form = glyphDatabase[currentLetterKey].forms[currentForm];
            let paths = '';
            form.rasm.forEach((strokePath, i) => {
                let fill = 'none';
                if (glyphDatabase[currentLetterKey].name.includes('Hamza') && i > 0) {
                    fill = 'var(--primary-color)';
                }
                paths += `<path id="letter-rasm-demo-${i}" class="letter-stroke-demo" d="${strokePath}" fill="${fill}" />`;
            });
            form.nuqat.forEach((dotCoords, i) => {
                paths += `<circle id="letter-nuqat-demo-${i}" fill="var(--primary-color)" cx="${dotCoords[0]}" cy="${dotCoords[1]}" r="4" />`;
            });
            svgContainer.innerHTML = paths;
            document.querySelectorAll('.letter-stroke-demo').forEach(path => {
                const pathLength = path.getTotalLength();
                path.style.strokeDasharray = pathLength;
                path.style.strokeDashoffset = pathLength;
            });
            drawTemplateOnCanvas();
        }

        function drawTemplateOnCanvas() {
            const dpr = window.devicePixelRatio || 1;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const form = glyphDatabase[currentLetterKey].forms[currentForm];
            
            // Get canvas display size (not pixel size)
            const displayWidth = canvas.width / dpr;
            const displayHeight = canvas.height / dpr;
            
            const scale = Math.min(displayWidth, displayHeight) / 100 * 0.7;
            const translateX = (displayWidth / 2) - (50 * scale);
            const translateY = (displayHeight / 2) - (50 * scale);
            const matrix = new DOMMatrix().translate(translateX, translateY).scale(scale);
            
            ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--border-color');
            ctx.lineWidth = 10 * dpr;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            form.rasm.forEach(strokePath => {
                const path2d = new Path2D(strokePath);
                const transformedPath = new Path2D();
                transformedPath.addPath(path2d, matrix);
                ctx.stroke(transformedPath);
            });
            ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--border-color');
            form.nuqat.forEach(dotCoords => {
                const transformedPoint = matrix.transformPoint(new DOMPoint(dotCoords[0], dotCoords[1]));
                ctx.beginPath();
                ctx.arc(transformedPoint.x, transformedPoint.y, 4 * dpr, 0, 2 * Math.PI);
                ctx.fill();
            });
        }

        // Track practice time
        let practiceStartTime = Date.now();
        setInterval(() => {
            if (document.visibilityState === 'visible') {
                userProgress.practiceTime += 1;
                if (userProgress.practiceTime % 60 === 0) {
                    saveProgress();
                }
            }
        }, 1000);

        function startDraw(e) {
            e.preventDefault();
            console.log('Start drawing...');
            if (userStroke.length === 0) {
                feedbackPanel.innerHTML = 'جاري الرسم...';
                feedbackPanel.className = 'w-full min-h-[6rem] h-auto bg-blue-100 p-4 rounded-lg flex flex-col items-center justify-center text-center font-medium text-blue-700 transition-all';
            }
            isDrawing = true;
            const dpr = window.devicePixelRatio || 1;
            ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-color');
            ctx.lineWidth = 6 * dpr;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            const { x, y } = getCoords(e);
            ctx.moveTo(x, y);
            userStroke.push({ x: x, y: y, t: Date.now() });
        }

        function draw(e) {
            if (!isDrawing) return;
            e.preventDefault();
            const { x, y } = getCoords(e);
            console.log(`Drawing at: x=${x}, y=${y}`);
            ctx.lineTo(x, y);
            ctx.stroke();
            userStroke.push({ x: x, y: y, t: Date.now() });
        }

        function stopDraw() {
            if (!isDrawing) return;
            console.log('Stop drawing.');
            isDrawing = false;
            ctx.closePath();
        }

        function getCoords(e) {
            const rect = canvas.getBoundingClientRect();
            let x, y;
            if (e.touches) {
                x = e.touches[0].clientX - rect.left;
                y = e.touches[0].clientY - rect.top;
            } else {
                x = e.clientX - rect.left;
                y = e.clientY - rect.top;
            }
            return { x, y };
        }

        function clearPad() {
            drawTemplateOnCanvas();
            userStroke = [];
            feedbackPanel.innerHTML = '🎯 جاهز للكتابة!';
            feedbackPanel.className = 'w-full min-h-[6rem] h-auto bg-gray-100 p-4 rounded-lg flex flex-col items-center justify-center text-center font-medium text-gray-700 transition-all';
            resetAnimation(); 
                }
        
        function resetAnimation() {
            const paths = document.querySelectorAll('.letter-stroke-demo');
            console.log('Resetting animation, found paths:', paths.length);
            paths.forEach(path => {
                const pathLength = path.getTotalLength();
                path.style.transition = 'none';
                path.style.strokeDashoffset = pathLength + 'px';
                path.style.strokeDasharray = pathLength + 'px';
                path.classList.remove('draw'); // Remove the draw class
                console.log('Reset path, strokeDashoffset set to:', pathLength);
            });
        }

        // --- EVENT LISTENERS & INITIALIZATION ---
        let isAnimating = false; // Track animation state
        
        drawButton.addEventListener('click', () => {
            const paths = document.querySelectorAll('.letter-stroke-demo');
            const firstPath = paths[0];
            
            console.log('Draw button clicked');
            console.log('Paths found:', paths.length);
            console.log('First path offset:', firstPath ? firstPath.style.strokeDashoffset : 'none');
            console.log('isAnimating:', isAnimating);
            
            if (!firstPath) {
                console.error('No paths found!');
                return;
            }
            
            const currentOffset = parseFloat(firstPath.style.strokeDashoffset);
            console.log('Current offset (number):', currentOffset);
            
            // Check if animation is done (offset is 0) and not animating
            if (currentOffset === 0 && !isAnimating) {
                console.log('Already drawn, telling user to clear');
                speak('لإعادة المشاهدة، اضغط مسح ثم شاهد', 'ar-SA');
                return;
            }
            
            if (isAnimating) {
                console.log('Already animating, ignoring');
                return;
            }
            
            isAnimating = true;
            console.log('Starting animation');
            
            speak('شاهِدْ طَرِيقةْ الكتابةْ', 'ar-SA');
            let totalDelay = 0;
            paths.forEach((path) => {
                const pathLength = path.getTotalLength();
                const duration = Math.max(800, pathLength * 4);
                path.style.transition = 'none';
                path.style.strokeDashoffset = pathLength + 'px';
                path.getBoundingClientRect(); // Force reflow
                path.style.transition = `stroke-dashoffset ${duration / 1000}s ease-in-out`;
                setTimeout(() => {
                    path.classList.add('draw');
                }, totalDelay);
                totalDelay += duration;
            });
            
            setTimeout(() => {
                console.log('Animation complete');
                paths.forEach(path => {
                    path.style.strokeDashoffset = '0px';
                    path.style.transition = 'none';
                });
                isAnimating = false;
            }, totalDelay + 500);
        });

        // Audio button - pronounce the Arabic letter sound
        audioButton.addEventListener('click', () => {
            speakLetter(currentLetterKey);
        });

        canvas.addEventListener('mousedown', startDraw);
        canvas.addEventListener('mousemove', draw);
        canvas.addEventListener('mouseup', stopDraw);
        canvas.addEventListener('mouseout', stopDraw);
        canvas.addEventListener('touchstart', startDraw, { passive: false });
        canvas.addEventListener('touchmove', draw, { passive: false });
        canvas.addEventListener('touchend', stopDraw);

        analyzeButton.addEventListener('click', () => {
            speak('جاري التحليل', 'ar-SA');
            if (userStroke.length > 5) {
                analyzeStroke(userStroke);
            } else {
                feedbackPanel.textContent = 'Stroke was too short. Try again.';
                feedbackPanel.className = 'w-full min-h-[6rem] h-auto bg-yellow-100 p-4 rounded-lg flex items-center justify-center text-center font-medium text-yellow-700 transition-all';
                speak('الرسم قصير جدا، حاول مرة أخرى', 'ar-SA');
            }
            userStroke = [];
        });

        clearButton.addEventListener('click', () => {
            speak('تم المسح', 'ar-SA');
            clearPad();
        });
        letterSelect.addEventListener('change', updateContextOptions);
        window.addEventListener('resize', resizeCanvas);

        // Initial Setup
        await loadGlyphData();
        
        // Wait for voices to load
        if (speechSynth.onvoiceschanged !== undefined) {
            speechSynth.onvoiceschanged = () => {
                console.log('Voices loaded:', speechSynth.getVoices().length);
            };
        }
        
        // Make sure glyphDatabase is loaded before proceeding
        if (!glyphDatabase) {
            console.error('Failed to load glyph database');
            feedbackPanel.innerHTML = '❌ خطأ في تحميل البيانات. الرجاء تحديث الصفحة.';
            return;
        }
        
        setTimeout(() => {
            resizeCanvas();
            updateContextOptions();
            
            // Add click audio feedback to other buttons if they exist
            const hintButton = document.getElementById('hint-button');
            const compareButton = document.getElementById('compare-button');
            const statsButton = document.getElementById('stats-button');
            const themeToggle = document.getElementById('theme-toggle');
            const closeStatsButton = document.getElementById('close-stats');
            const resetProgressButton = document.getElementById('reset-progress');
            const exportStatsButton = document.getElementById('export-stats');
            
            if (hintButton) {
                hintButton.addEventListener('click', () => speak('تلميح', 'ar-SA'));
            }
            if (compareButton) {
                compareButton.addEventListener('click', () => speak('مقارنة', 'ar-SA'));
            }
            if (statsButton) {
                statsButton.addEventListener('click', showStatistics);
            }
            if (closeStatsButton) {
                closeStatsButton.addEventListener('click', hideStatistics);
            }
            if (resetProgressButton) {
                resetProgressButton.addEventListener('click', resetProgress);
            }
            if (exportStatsButton) {
                exportStatsButton.addEventListener('click', exportStatistics);
            }
            if (themeToggle) {
                themeToggle.addEventListener('click', () => speak('تبديل الوضع', 'ar-SA'));
            }
            
            // Close modal when clicking outside
            const statsModal = document.getElementById('stats-modal');
            if (statsModal) {
                statsModal.addEventListener('click', (e) => {
                    if (e.target === statsModal) {
                        hideStatistics();
                    }
                });
            }
            
            // Add audio feedback when letter changes
            letterSelect.addEventListener('change', () => {
                setTimeout(() => {
                    if (glyphDatabase) speakLetter(currentLetterKey);
                }, 300);
            });
            
            // Update progress UI on load (after glyphDatabase is loaded)
            if (glyphDatabase) {
                updateProgressUI();
            }
            
            // --- WELCOME MODAL ---
            const welcomeModal = document.getElementById('welcome-modal');
            const welcomeForm = document.getElementById('welcome-form');
            const userNameInput = document.getElementById('user-name');
            
            // Show welcome modal if user hasn't set their name
            if (!userName && welcomeModal) {
                welcomeModal.classList.remove('hidden');
                setTimeout(() => userNameInput?.focus(), 300);
            }
            
            // Handle welcome form submission
            if (welcomeForm) {
                welcomeForm.addEventListener('submit', (e) => {
                    e.preventDefault();
                    const name = userNameInput.value.trim();
                    
                    if (name) {
                        userName = name;
                        localStorage.setItem('userName', userName);
                        
                        // Hide modal with animation
                        welcomeModal.classList.add('hidden');
                        
                        // Personalized greeting
                        setTimeout(() => {
                            speak(`أهلاً وسهلاً ${userName}! مستعد لتعلم الحروف؟`, 'ar-SA');
                        }, 500);
                    }
                });
            }
        }, 0);
    });
})();
