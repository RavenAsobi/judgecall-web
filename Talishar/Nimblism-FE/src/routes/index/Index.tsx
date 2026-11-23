import React, { useEffect } from 'react';
import { useAppDispatch } from 'app/Hooks';
import { clearGameInfo } from 'features/game/GameSlice';
import { usePageTitle } from 'hooks/usePageTitle';
import SimplePractice from './SimplePractice';

const Index = () => {
  const dispatch = useAppDispatch();
  usePageTitle('Practice against Fai');

  useEffect(() => {
    dispatch(clearGameInfo());
  }, [dispatch]);

  return <SimplePractice />;
};

export default Index;
