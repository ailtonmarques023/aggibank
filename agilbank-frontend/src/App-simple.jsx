import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

// Componente de teste simples
const TestComponent = () => {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="max-w-md w-full bg-white p-8 rounded-lg shadow">
        <h1 className="text-2xl font-bold text-center text-gray-900 mb-6">
          AgilBank - Teste
        </h1>
        <p className="text-gray-600 text-center">
          Se você está vendo esta mensagem, o React está funcionando!
        </p>
        <div className="mt-6 text-center">
          <button className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700">
            Botão de Teste
          </button>
        </div>
      </div>
    </div>
  );
};

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<TestComponent />} />
        <Route path="/login" element={<TestComponent />} />
        <Route path="/dashboard" element={<TestComponent />} />
        <Route path="*" element={<TestComponent />} />
      </Routes>
    </Router>
  );
}

export default App;
