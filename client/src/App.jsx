import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { STATUS } from './vocab.js';
import Layout from './components/Layout.jsx';
import Home from './pages/Home.jsx';
import Finder from './pages/Finder.jsx';
import Plan from './pages/Plan.jsx';
import Atlas from './pages/Atlas.jsx';
import Method from './pages/Method.jsx';
import Lost from './pages/Lost.jsx';
import Families from './pages/Families.jsx';
import Design from './pages/Design.jsx';
import Library from './pages/Library.jsx';
import About from './pages/About.jsx';
import Submit from './pages/Submit.jsx';
import Calculators from './pages/Calculators.jsx';
import Biases from './pages/Biases.jsx';
import Questions from './pages/Questions.jsx';

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/find" element={<Finder />} />
        <Route path="/plan" element={<Plan />} />
        <Route path="/methods" element={<Atlas />} />
        <Route path="/methods/:id" element={<Method />} />
        <Route path="/lost" element={<Lost />} />
        <Route path="/families" element={<Families />} />
        <Route path="/design" element={<Design />} />
        <Route path="/library" element={<Library />} />
        <Route path="/calculators" element={<Calculators />} />
        <Route path="/calculators/:calc" element={<Calculators />} />
        <Route path="/biases" element={<Biases />} />
        <Route path="/questions" element={<Questions />} />
        <Route path="/submit" element={<Submit />} />
        <Route path="/about" element={<About />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Layout>
  );
}

// Old in-page links such as #vestigial land here under hash routing; send them to that status in the atlas.
function NotFound() {
  const key = useLocation().pathname.replace(/^\/+|\/+$/g, '');
  if (STATUS[key]) return <Navigate to={`/methods?status=${key}`} replace />;
  return <div className="section"><div className="wrap"><h1 className="h1">Not found</h1><p className="lede">That page does not exist.</p></div></div>;
}
