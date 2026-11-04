import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import {DemoAccess} from './DemoAccess';
import './styles.css';

createRoot(document.getElementById('root')!).render(<StrictMode><DemoAccess><App /></DemoAccess></StrictMode>);
