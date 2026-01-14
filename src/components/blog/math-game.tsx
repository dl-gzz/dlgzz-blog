'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, Trophy, RefreshCw, Star } from 'lucide-react';

interface Question {
  num1: number;
  num2: number;
  operator: '+' | '-';
  answer: number;
}

export function MathGame() {
  const [gameStarted, setGameStarted] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [userAnswer, setUserAnswer] = useState('');
  const [score, setScore] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [questionsAnswered, setQuestionsAnswered] = useState(0);
  const [gameMode, setGameMode] = useState<'easy' | 'medium' | 'hard'>('easy');
  const [showResult, setShowResult] = useState(false);

  // 生成新题目
  const generateQuestion = (): Question => {
    let num1: number, num2: number, operator: '+' | '-';

    if (gameMode === 'easy') {
      // 简单模式：5以内加减法
      num1 = Math.floor(Math.random() * 5) + 1;
      num2 = Math.floor(Math.random() * 5) + 1;
    } else if (gameMode === 'medium') {
      // 中等模式：10以内加减法
      num1 = Math.floor(Math.random() * 10) + 1;
      num2 = Math.floor(Math.random() * 10) + 1;
    } else {
      // 困难模式：20以内加减法
      num1 = Math.floor(Math.random() * 20) + 1;
      num2 = Math.floor(Math.random() * 20) + 1;
    }

    operator = Math.random() > 0.5 ? '+' : '-';

    // 确保减法结果为正数
    if (operator === '-' && num2 > num1) {
      [num1, num2] = [num2, num1];
    }

    const answer = operator === '+' ? num1 + num2 : num1 - num2;

    return { num1, num2, operator, answer };
  };

  // 开始游戏
  const startGame = (mode: 'easy' | 'medium' | 'hard') => {
    setGameMode(mode);
    setGameStarted(true);
    setScore(0);
    setTotalQuestions(0);
    setQuestionsAnswered(0);
    setShowResult(false);
    setCurrentQuestion(generateQuestion());
  };

  // 检查答案
  const checkAnswer = () => {
    if (!currentQuestion || userAnswer === '') return;

    const isCorrect = parseInt(userAnswer) === currentQuestion.answer;
    setFeedback(isCorrect ? 'correct' : 'wrong');
    setTotalQuestions(totalQuestions + 1);

    if (isCorrect) {
      setScore(score + 1);
    }

    setTimeout(() => {
      setFeedback(null);
      setUserAnswer('');
      setQuestionsAnswered(questionsAnswered + 1);

      // 10题后显示结果
      if (questionsAnswered + 1 >= 10) {
        setShowResult(true);
      } else {
        setCurrentQuestion(generateQuestion());
      }
    }, 1500);
  };

  // 处理键盘输入
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      checkAnswer();
    }
  };

  // 获取鼓励语
  const getEncouragement = () => {
    const percentage = (score / 10) * 100;
    if (percentage === 100) return '🎉 完美！你真是数学小天才！';
    if (percentage >= 80) return '🌟 太棒了！继续保持！';
    if (percentage >= 60) return '👍 很不错！再接再厉！';
    if (percentage >= 40) return '💪 加油！你一定可以做得更好！';
    return '📚 多练习，你会越来越棒的！';
  };

  if (!gameStarted) {
    return (
      <Card className="w-full max-w-2xl mx-auto my-8">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl">🎮 选择难度</CardTitle>
          <CardDescription>选择适合你的难度等级开始游戏</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={() => startGame('easy')}
            className="w-full h-20 text-lg"
            variant="outline"
          >
            <div className="flex flex-col items-center gap-2">
              <span className="text-2xl">😊 简单模式</span>
              <span className="text-sm text-muted-foreground">5以内加减法</span>
            </div>
          </Button>

          <Button
            onClick={() => startGame('medium')}
            className="w-full h-20 text-lg"
            variant="outline"
          >
            <div className="flex flex-col items-center gap-2">
              <span className="text-2xl">🤔 中等模式</span>
              <span className="text-sm text-muted-foreground">10以内加减法</span>
            </div>
          </Button>

          <Button
            onClick={() => startGame('hard')}
            className="w-full h-20 text-lg"
            variant="outline"
          >
            <div className="flex flex-col items-center gap-2">
              <span className="text-2xl">🤓 困难模式</span>
              <span className="text-sm text-muted-foreground">20以内加减法</span>
            </div>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (showResult) {
    const percentage = (score / 10) * 100;
    return (
      <Card className="w-full max-w-2xl mx-auto my-8">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <Trophy className="w-20 h-20 text-yellow-500" />
          </div>
          <CardTitle className="text-3xl">游戏结束！</CardTitle>
          <CardDescription className="text-lg">{getEncouragement()}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="text-center space-y-4">
            <div className="text-6xl font-bold text-primary">{score}/10</div>
            <div className="flex justify-center gap-1">
              {Array.from({ length: 10 }).map((_, i) => (
                <Star
                  key={i}
                  className={`w-8 h-8 ${
                    i < score
                      ? 'fill-yellow-400 text-yellow-400'
                      : 'text-gray-300'
                  }`}
                />
              ))}
            </div>
            <Progress value={percentage} className="h-4" />
            <p className="text-2xl font-semibold">正确率: {percentage}%</p>
          </div>

          <div className="flex gap-4">
            <Button
              onClick={() => startGame(gameMode)}
              className="flex-1"
              size="lg"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              再玩一次
            </Button>
            <Button
              onClick={() => setGameStarted(false)}
              variant="outline"
              className="flex-1"
              size="lg"
            >
              返回选择
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-2xl mx-auto my-8">
      <CardHeader>
        <div className="flex justify-between items-center mb-4">
          <Badge variant="outline" className="text-lg px-4 py-2">
            {gameMode === 'easy' && '😊 简单'}
            {gameMode === 'medium' && '🤔 中等'}
            {gameMode === 'hard' && '🤓 困难'}
          </Badge>
          <div className="flex gap-4 text-sm">
            <span>题目: {questionsAnswered + 1}/10</span>
            <span>得分: {score}</span>
          </div>
        </div>
        <Progress value={(questionsAnswered / 10) * 100} className="h-2" />
      </CardHeader>

      <CardContent className="space-y-8">
        {currentQuestion && (
          <>
            <div className="text-center space-y-8">
              <div className="text-7xl font-bold flex items-center justify-center gap-6">
                <span className="text-primary">{currentQuestion.num1}</span>
                <span className="text-muted-foreground">{currentQuestion.operator}</span>
                <span className="text-primary">{currentQuestion.num2}</span>
                <span className="text-muted-foreground">=</span>
                <span className="text-primary">?</span>
              </div>

              <div className="flex flex-col items-center gap-4">
                <input
                  type="number"
                  value={userAnswer}
                  onChange={(e) => setUserAnswer(e.target.value)}
                  onKeyPress={handleKeyPress}
                  className="text-5xl text-center w-40 h-20 border-4 border-primary rounded-lg focus:outline-none focus:ring-4 focus:ring-primary/20"
                  placeholder="?"
                  autoFocus
                  disabled={feedback !== null}
                />

                <Button
                  onClick={checkAnswer}
                  disabled={userAnswer === '' || feedback !== null}
                  size="lg"
                  className="text-xl px-12 py-6"
                >
                  提交答案
                </Button>
              </div>
            </div>

            {feedback && (
              <div
                className={`text-center py-8 rounded-lg ${
                  feedback === 'correct'
                    ? 'bg-green-50 dark:bg-green-900/20'
                    : 'bg-red-50 dark:bg-red-900/20'
                }`}
              >
                {feedback === 'correct' ? (
                  <div className="space-y-2">
                    <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto" />
                    <p className="text-3xl font-bold text-green-600">太棒了！✨</p>
                    <p className="text-lg text-muted-foreground">答对啦！</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <XCircle className="w-16 h-16 text-red-500 mx-auto" />
                    <p className="text-3xl font-bold text-red-600">再想想 🤔</p>
                    <p className="text-lg text-muted-foreground">
                      正确答案是: {currentQuestion.answer}
                    </p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
